// isan Chat dev-agent sidecar: runs the Claude Agent SDK on behalf of the
// Chat app and routes EVERY tool call back to the Dart host for a decision.
//
// Why a sidecar: the Agent SDK is a Node package; the Chat app spawns this
// script over stdio (no listening port) and speaks newline-delimited JSON.
//
// Why the hook is the gate: a PreToolUse hook fires for every tool call,
// including reads inside cwd and read-only Bash (`cat .env`) that the SDK
// would otherwise self-approve without ever reaching canUseTool. The hook
// awaits the host's answer; canUseTool also forwards as a second check.
//
// Security floor (do not relax without a T3 review):
//   - settingSources: [] — a repo's .claude/settings.json allow rules or hooks
//     would otherwise approve calls behind the user's back; also no CLAUDE.md.
//   - permissionMode 'default'; no allowedTools; never acceptEdits/bypass.
//   - disallowedTools: web, sub-agents, sudo, git push.
//   - env is REPLACED (not merged): only PATH/HOME/LANG, the API key from the
//     host, and an isolated CLAUDE_CONFIG_DIR so the user's own Claude login
//     is never picked up. No key or no config dir => refuse to start.
//   - the API key is never written to stdout/stderr (every line is redacted).
//
// Protocol (one JSON object per line):
//   host -> sidecar: start {requestId, prompt, cwd, root, model?, resume?}
//                    decide_result {id, behavior, updatedInput?, message?}
//                    interrupt
//   sidecar -> host: ready, decide {id, phase, toolName, input, toolUseId},
//                    post_tool {toolUseId, toolName, input},
//                    text {requestId, delta|text}, result {...}, error {message}
//   `text.delta` is a live streaming fragment; `text.text` is the complete
//   text of one finished assistant message (authoritative over the deltas).

import { realpathSync } from 'node:fs';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

export const DISALLOWED_TOOLS = Object.freeze([
  'WebFetch',
  'WebSearch',
  'Task',
  'Agent',
  'Bash(sudo *)',
  'Bash(git push *)',
]);

/** Seconds a PreToolUse hook may wait for the user's answer. */
export const HOOK_TIMEOUT_SECONDS = 3600;

/**
 * Local fail-closed deadline for every pending host decision, a little under
 * the hook timeout so OUR deny wins over whatever the SDK does when a hook
 * times out. SIDECAR_DECISION_TIMEOUT_MS may only SHORTEN it (tests).
 */
export const DECISION_TIMEOUT_MS = 3500 * 1000;

export function decisionTimeoutMs(env) {
  const v = Number(env.SIDECAR_DECISION_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? Math.min(v, DECISION_TIMEOUT_MS) : DECISION_TIMEOUT_MS;
}

function makeRedactor(secret) {
  if (!secret) return (s) => s;
  return (s) => String(s).split(secret).join('[redacted]');
}

/**
 * Build the SDK options. Exported for the test's option probe.
 */
export function buildOptions({ cwd, model, resume, env, hooks, canUseTool, stderr, abortController }) {
  const options = {
    cwd,
    settingSources: [],
    strictMcpConfig: true,
    permissionMode: 'default',
    disallowedTools: [...DISALLOWED_TOOLS],
    env,
    hooks,
    canUseTool,
    stderr,
    abortController,
    includePartialMessages: true,
  };
  if (model) options.model = model;
  if (resume) options.resume = resume;
  return options;
}

export async function runSidecar({
  input = process.stdin,
  output = process.stdout,
  errOutput = process.stderr,
  env = process.env,
  loadQuery,
} = {}) {
  const apiKey = env.ANTHROPIC_API_KEY || '';
  const configDir = env.CLAUDE_CONFIG_DIR || '';
  const redact = makeRedactor(apiKey);
  const send = (obj) => output.write(redact(JSON.stringify(obj)) + '\n');
  const logErr = (s) => errOutput.write(redact(s));

  if (!apiKey) {
    send({ type: 'error', message: 'no API key provided; refusing to start' });
    return 1;
  }
  if (!configDir) {
    send({ type: 'error', message: 'no isolated CLAUDE_CONFIG_DIR; refusing to start' });
    return 1;
  }
  // The child process gets ONLY these variables (Options.env replaces).
  const childEnv = {
    PATH: env.PATH || '/usr/bin:/bin',
    HOME: env.HOME || '',
    LANG: env.LANG || 'en_US.UTF-8',
    ANTHROPIC_API_KEY: apiKey,
    CLAUDE_CONFIG_DIR: configDir,
    CLAUDE_AGENT_SDK_CLIENT_APP: 'isan-chat-agent/0.1',
  };

  let query;
  try {
    query = await loadQuery();
  } catch (e) {
    send({ type: 'error', message: `agent SDK failed to load: ${e && e.message}` });
    return 1;
  }

  let nextDecideId = 0;
  const pending = new Map(); // decide id -> resolve
  const timeoutMs = decisionTimeoutMs(env);
  let hostGone = false;
  let active = null; // { requestId, q, abort }

  function askHost(phase, toolName, toolInput, toolUseId, signal) {
    const id = `d${++nextDecideId}`;
    return new Promise((resolve) => {
      if (hostGone) return resolve({ behavior: 'deny', message: 'host disconnected' });
      let timer;
      const done = (r) => {
        if (!pending.has(id)) return; // first answer wins
        clearTimeout(timer);
        pending.delete(id);
        resolve(r);
      };
      pending.set(id, done);
      // Fail closed: no answer in time => deny.
      timer = setTimeout(() => done({ behavior: 'deny', message: 'approval timed out' }), timeoutMs);
      if (signal) {
        if (signal.aborted) return done({ behavior: 'deny', message: 'aborted' });
        signal.addEventListener('abort', () => done({ behavior: 'deny', message: 'aborted' }), { once: true });
      }
      send({ type: 'decide', id, phase, toolName, input: toolInput, toolUseId });
    });
  }

  async function preToolUse(hookInput, toolUseID, { signal } = {}) {
    let r;
    try {
      r = await askHost('hook', hookInput.tool_name, hookInput.tool_input, hookInput.tool_use_id ?? toolUseID, signal);
    } catch {
      r = { behavior: 'deny', message: 'host decision failed' };
    }
    if (r && r.behavior === 'allow') {
      const out = { hookEventName: 'PreToolUse', permissionDecision: 'allow' };
      if (r.updatedInput && typeof r.updatedInput === 'object') out.updatedInput = r.updatedInput;
      return { hookSpecificOutput: out };
    }
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: (r && r.message) || 'Denied by the Chat app',
      },
    };
  }

  async function postToolUse(hookInput, toolUseID) {
    send({
      type: 'post_tool',
      toolUseId: hookInput.tool_use_id ?? toolUseID,
      toolName: hookInput.tool_name,
      input: hookInput.tool_input,
    });
    return {};
  }

  async function canUseTool(toolName, toolInput, { signal, toolUseID } = {}) {
    let r;
    try {
      r = await askHost('canUseTool', toolName, toolInput, toolUseID, signal);
    } catch {
      r = { behavior: 'deny', message: 'host decision failed' };
    }
    if (r && r.behavior === 'allow') {
      return { behavior: 'allow', updatedInput: r.updatedInput && typeof r.updatedInput === 'object' ? r.updatedInput : toolInput };
    }
    return { behavior: 'deny', message: (r && r.message) || 'Denied by the Chat app' };
  }

  const hooks = {
    // No matcher = every tool.
    PreToolUse: [{ hooks: [preToolUse], timeout: HOOK_TIMEOUT_SECONDS }],
    PostToolUse: [{ hooks: [postToolUse] }],
  };

  async function runRequest(msg) {
    const { requestId } = msg;
    const abortController = new AbortController();
    const options = buildOptions({
      cwd: msg.cwd,
      model: msg.model,
      resume: msg.resume,
      env: childEnv,
      hooks,
      canUseTool,
      stderr: (d) => logErr(d),
      abortController,
    });
    const q = query({ prompt: String(msg.prompt ?? ''), options });
    active = { requestId, q, abortController };
    let sawResult = false;
    try {
      for await (const m of q) {
        if (m.type === 'stream_event') {
          const ev = m.event;
          if (ev && ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta' && !m.parent_tool_use_id) {
            send({ type: 'text', requestId, delta: ev.delta.text });
          }
        } else if (m.type === 'assistant' && !m.parent_tool_use_id) {
          const blocks = (m.message && m.message.content) || [];
          const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
          if (text) send({ type: 'text', requestId, text });
        } else if (m.type === 'result') {
          sawResult = true;
          send({
            type: 'result',
            requestId,
            sessionId: m.session_id,
            usage: m.usage ?? null,
            costUsd: m.total_cost_usd ?? null,
            isError: !!m.is_error,
            subtype: m.subtype,
          });
        }
      }
    } catch (e) {
      send({ type: 'error', requestId, message: `agent run failed: ${e && e.message}` });
    } finally {
      for (const done of [...pending.values()]) done({ behavior: 'deny', message: 'request ended' });
      if (!sawResult) send({ type: 'result', requestId, sessionId: null, usage: null, isError: true, subtype: 'aborted' });
      active = null;
    }
  }

  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  input.on?.('error', () => {
    hostGone = true;
    for (const done of [...pending.values()]) done({ behavior: 'deny', message: 'host disconnected' });
  });
  send({ type: 'ready' });
  const runs = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ type: 'error', message: 'malformed host message' });
      continue;
    }
    switch (msg.type) {
      case 'start':
        if (active) {
          send({ type: 'error', requestId: msg.requestId, message: 'a request is already running' });
        } else if (typeof msg.cwd !== 'string' || !msg.cwd) {
          send({ type: 'error', requestId: msg.requestId, message: 'start without cwd' });
        } else {
          runs.push(runRequest(msg));
        }
        break;
      case 'decide_result': {
        const done = pending.get(msg.id);
        if (done) done({ behavior: msg.behavior === 'allow' ? 'allow' : 'deny', updatedInput: msg.updatedInput, message: msg.message });
        break;
      }
      case 'interrupt':
        if (active) {
          try {
            await active.q.interrupt();
          } catch {
            active.abortController.abort();
          }
        }
        break;
      default:
        send({ type: 'error', message: `unknown host message: ${String(msg.type).slice(0, 40)}` });
    }
  }
  // stdin closed: the host is gone. Deny everything pending (and anything
  // asked from now on), then abort and leave.
  hostGone = true;
  for (const done of [...pending.values()]) done({ behavior: 'deny', message: 'host disconnected' });
  if (active) active.abortController.abort();
  await Promise.allSettled(runs);
  return 0;
}

async function defaultLoadQuery() {
  if (process.env.SIDECAR_FAKE_QUERY === '1') {
    return (await import('./test/fake_query.mjs')).fakeQuery;
  }
  return (await import('@anthropic-ai/claude-agent-sdk')).query;
}

// pathToFileURL + realpath: the install dir is under "Application Support"
// (a space), and Node reports the main module by its real path.
const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (isMain) {
  const env = { ...process.env };
  // Nothing spawned from here inherits the key except via Options.env.
  delete process.env.ANTHROPIC_API_KEY;
  runSidecar({ env, loadQuery: defaultLoadQuery }).then((code) => process.exit(code));
}
