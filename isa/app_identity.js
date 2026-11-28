// LIVE APP IDENTITY for standalone per-applet pages (spec §13 step 2,
// liveid2-1031). Loaded from index.html as an external file — script-src
// 'self' covers it, so the pinned inline-script CSP hashes are untouched.
//
// On load and whenever the page becomes visible again (throttled 30 s) it
// fetches the PUBLIC identity feed (<edge>/t4/apps-identity.json), keeps a
// last-good copy in localStorage, and — only when THIS standalone applet has
// an override entry — applies it:
//   * document.title = name            (text only, never HTML)
//   * <link rel=manifest>  -> <edge>/t4/identity/<id>/manifest.json
//                             (manifest-dev.json on dev.devisant.com)
//   * only when the entry has an icon:
//     <link rel=icon>             -> <edge>/t4/identity/<id>/favicon-48.png
//     <link rel=apple-touch-icon> -> <edge>/t4/identity/<id>/apple-touch-180.png
// No entry => the page keeps exactly what was built.
//
// The feed is HOSTILE input: validated like lib/src/app_identity.dart's
// parseIdentityFeed (schema, size cap, app count, id/icon/colour shapes,
// name stripped of control/format chars and < > " `, <= 80 chars).
// The standalone-id rule mirrors the manifest-swap IIFE in index.html
// (lib/src/deeplink.dart standaloneIdFromUri): last non-empty path segment
// (ignoring index.html), ^[a-z0-9_]{1,64}$, and never the app's own base
// segment.
(function (root) {
  'use strict';

  var EDGE = 'https://167.233.64.97';
  var FEED_URL = EDGE + '/t4/apps-identity.json';
  var SCHEMA = 'isan-apps-identity/1';
  var MAX_BYTES = 256 * 1024;
  var MAX_APPS = 500;
  var MAX_NAME = 80;
  var THROTTLE_MS = 30000;
  var TIMEOUT_MS = 4000;
  var CACHE_KEY = 'isan_app_identity_feed_v1';
  var DEV_HOST = 'dev.devisant.com';

  var ID_RE = /^[a-z0-9_]{1,64}$/;
  var ICON_RE = /^[a-z0-9_]{1,48}$/;
  var COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
  var NAME_STRIP = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}<>"`]/gu;

  function sanitizeName(raw) {
    if (typeof raw !== 'string') return null;
    var t = raw.replace(NAME_STRIP, '').trim();
    if (!t) return null;
    var cps = Array.from(t);
    if (cps.length > MAX_NAME) t = cps.slice(0, MAX_NAME).join('').trim();
    return t || null;
  }

  function utf8Length(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  // Returns {id: {name?, icon?, color?}} or null (reject the whole feed).
  function parseFeed(body) {
    try {
      if (typeof body !== 'string') return null;
      if (body.length > MAX_BYTES || utf8Length(body) > MAX_BYTES) return null;
      var d = JSON.parse(body);
      if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
      if (d.schema !== SCHEMA) return null;
      var apps = d.apps;
      if (!apps || typeof apps !== 'object' || Array.isArray(apps)) return null;
      var ids = Object.keys(apps);
      if (ids.length > MAX_APPS) return null;
      var out = {};
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var v = apps[id];
        if (!ID_RE.test(id) || !v || typeof v !== 'object' || Array.isArray(v)) {
          continue;
        }
        var e = {};
        var name = sanitizeName(v.name);
        if (name) e.name = name;
        if (typeof v.icon === 'string' && typeof v.color === 'string' &&
            ICON_RE.test(v.icon) && COLOR_RE.test(v.color)) {
          e.icon = v.icon;
          e.color = v.color.toUpperCase();
        }
        if (e.name || e.icon) out[id] = e;
      }
      return out;
    } catch (_) {
      return null;
    }
  }

  // Mirrors the manifest-swap IIFE in index.html.
  function standaloneId(pathname, baseHref) {
    var baseSegs = (baseHref || '').split('/').filter(Boolean);
    var baseSeg = baseSegs[baseSegs.length - 1];
    var segs = (pathname || '').split('/').filter(function (s) {
      return s && s !== 'index.html';
    });
    var id = segs[segs.length - 1];
    if (id && id !== baseSeg && ID_RE.test(id)) return id;
    return null;
  }

  // The hrefs/title to apply for [id] given [entry]; null = leave as built.
  function plan(id, entry, hostname) {
    if (!id || !entry || !ID_RE.test(id)) return null;
    var dir = EDGE + '/t4/identity/' + id + '/';
    var p = {
      title: entry.name || null,
      manifest: dir + (hostname === DEV_HOST ? 'manifest-dev.json'
                                             : 'manifest.json'),
      favicon: null,
      appleTouch: null
    };
    if (entry.icon) {
      p.favicon = dir + 'favicon-48.png';
      p.appleTouch = dir + 'apple-touch-180.png';
    }
    return p;
  }

  var api = {
    parseFeed: parseFeed,
    sanitizeName: sanitizeName,
    standaloneId: standaloneId,
    plan: plan,
    FEED_URL: FEED_URL
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  // ── Browser wiring ─────────────────────────────────────────────────────
  var doc = root.document;
  if (!doc) return;
  var base = doc.querySelector('base');
  var appId = standaloneId(root.location.pathname,
      base ? base.getAttribute('href') : '');
  if (!appId) return; // the app's own page: nothing to do.

  function readCache() {
    try { return root.localStorage.getItem(CACHE_KEY); } catch (_) { return null; }
  }
  function writeCache(body) {
    try { root.localStorage.setItem(CACHE_KEY, body); } catch (_) {}
  }

  function setLink(rel, href) {
    var link = doc.querySelector('link[rel="' + rel + '"]');
    if (link && link.getAttribute('href') !== href) {
      link.setAttribute('href', href);
    }
  }

  function apply(feed) {
    if (!feed) return;
    var p = plan(appId, feed[appId], root.location.hostname);
    if (!p) return;
    if (p.title) doc.title = p.title;
    setLink('manifest', p.manifest);
    if (p.favicon) setLink('icon', p.favicon);
    if (p.appleTouch) setLink('apple-touch-icon', p.appleTouch);
  }

  var last = 0;
  function refresh() {
    var now = Date.now();
    if (last && now - last < THROTTLE_MS) return;
    last = now;
    if (typeof root.fetch !== 'function') return;
    var ctl = typeof root.AbortController === 'function'
        ? new root.AbortController() : null;
    var timer = ctl ? root.setTimeout(function () { ctl.abort(); }, TIMEOUT_MS)
                    : null;
    root.fetch(FEED_URL, ctl ? { signal: ctl.signal, credentials: 'omit' }
                             : { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (body) {
        var feed = body == null ? null : parseFeed(body);
        if (feed) { writeCache(body); apply(feed); }
      })
      .catch(function () { /* offline: keep last-good */ })
      .then(function () { if (timer) root.clearTimeout(timer); });
  }

  try { apply(parseFeed(readCache())); } catch (_) {}
  refresh();
  doc.addEventListener('visibilitychange', function () {
    if (doc.visibilityState === 'visible') refresh();
  });
})(typeof window !== 'undefined' ? window : this);
