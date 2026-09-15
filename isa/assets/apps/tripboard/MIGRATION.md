# tripboard (Tripboard) — schema migrations

## 2026-07-28 — Design-quality round (designpass-0728, unit 3): dense rows, real color swatches, humanized Activity time, calendar opens where the data is

seedVersion `2026-07-28.6`. Adopts the new density/toggle/dotColumn/rules.date/
initialView engine primitives (`_claude/projects/applet-density-design-spec.md`,
built against `fb-dev` @`218f0d7`) to fix the real-screenshot complaints:
200px member cards with the literal word "teal", tall todo/packing cards with
gray status-text chips, raw ISO timestamps in Activity, an empty-July
Calendar, and dead vertical space everywhere. JSON-only in `apps/tripboard`
(no engine change this round — the primitives were already built/pinned).

- **Members: real color dot, not a text chip.** `cards` on the Members
  screen gains `"density":"row"` + `"dotColumn":"color"` + a `"colors"` map
  (the 9 ramp names self-mapped, same convention as `accentColors`) — a
  small filled circle now shows each member's actual chosen hue. Dropped
  `"tags":[{"column":"color"}]`, the literal source of the raw word "teal"
  users saw on screenshots.
  - **Honest engine gap, not hacked around:** `cards_render.dart`'s
    `_leadingVisual` resolves the leading slot in strict precedence order
    (image → `iconColumn` → `dotColumn`) and returns the FIRST match — it
    cannot render both an icon/emoji chip and a color dot in the same
    leading slot. Setting both `iconColumn:"emoji"` and `dotColumn:"color"`
    would silently make the dot never render (iconColumn always wins).
    Since the ask was a real color dot AND the emoji still visible, the
    emoji moved from the leading chip to a trailing tag pill
    (`"tags":[{"column":"emoji"}]`) instead of being dropped — `iconColumn`
    is no longer set on this node. A future engine round could add a
    combined leading-glyph-plus-dot slot; not built here.
- **Todo / Packing: a real checkbox, not a status-text chip.** Both screens'
  `cards` gain `"density":"row"` + `"toggle":true` +
  `"statusColumn":"status"` + `"doneValue":"done"` + `"openValue":"todo"` —
  a real leading `Checkbox` bound to the existing `status` column (reusing
  `BoardRenderer._toggleTap`, the same default statusColumn/doneValue/
  openValue convention the agenda/tree nodes already use). Dropped
  `"tags":[{"column":"status"}]` (the raw "todo"/"done" text chip — the
  checkbox already shows the state) and replaced it with
  `"tags":[{"column":"assignee"}]` so who it's assigned to stays visible.
  The existing whole-row `"action":{"fn":"toggleField",...}` is UNCHANGED —
  tapping anywhere on the row still toggles, exactly as before; the checkbox
  is an additional, more discoverable affordance for the same action.
  `accentColumn`/`accentColors` stay declared (inert in row density, kept so
  the applet degrades gracefully if density is ever removed).
  - **Dropped `expandable`/`expandChevron`/`expandFields` on these two
    nodes** — `density:"row"`'s `_rowTile` layout has no expand/chevron
    affordance at all (checked `cards_render.dart` — only leading + title +
    up to 2 tag pills + a whole-row tap), so those props were dead JSON, not
    a real path to the notes body anymore. Full-record detail (notes body,
    assignee, status) is still reachable via the existing `swipeActions:
    ["edit","delete"]` → the real record editor. Captions on both screens
    trimmed to drop the now-false "tap the chevron for details" line.
- **Activity: humanized time, not raw ISO.** `cards` gains
  `"density":"row"`. The `entries.updatedAt` column (`columns.json`) is
  retyped `dateTime` → `text` with `"rules":{"hidden":true,"date":true}` —
  `renderer.dart`'s `rules['date']` humanization branch
  (`"Jul 21, 11:05"`) only fires for a `DataType.text` column, never
  `dateTime` (confirmed in `fb-dev` source), and `updatedAt` is stamped by
  the ENGINE via the literal reserved key name regardless of its declared
  schema type (`board_state.dart`'s `_lwwReserved`/`addRow`/`setField`/
  `updateRow` all write `data['updatedAt']` unconditionally) — so the retype
  changes nothing about storage or sort order, only how it displays. No
  second "display" column was added (unlike krtravel's `start_display`
  pattern) because `updatedAt` is auto-stamped by the engine on every write;
  a hand-authored mirror column would go stale the moment a row is edited
  again, which would be worse than the raw ISO string it replaces.
  **Compat note:** `tool/check_compat.dart` classifies ANY column retype as
  BREAKING by construction (it can't tell "same string, different declared
  type, zero behavior change" from a real incompatible retype) — this entry
  is the written, tested acknowledgment `check_compat.sh` requires to accept
  it. No existing installs are actually affected: the stored value was
  always an ISO-8601 string either way, and `updatedAt` has been
  `rules.hidden` (never addRow/editable) since the tripboard-0728 rebuild.
  `test/tripboard_applet_test.dart`'s hidden-column assertion still holds.
- **Calendar opens where the data is.** `"initialView":"firstWithData"` on
  the Calendar's `calendar` node — seed events are Aug–Oct 2026, so opening
  on `DateTime.now()`'s month (July) showed an empty grid with no cue that
  data existed elsewhere. Caption trimmed to one line.
- **Scaffolding, every screen.** Every screen's body `column` gains
  `"crossAxis":"start"` (the unit-2/krtravel quick-win — a `column`'s
  default `crossAxisAlignment` is `stretch`, which is why buttons rendered
  full-width; `cards`/`calendar`/`glmap` fill regardless of the parent's
  cross-axis alignment, confirmed already working on krtravel's shipped
  Map/Best-spots/Timeline screens). The Activity caption was trimmed to one
  line (meaning UNCHANGED: still states no-whole-board-undo + per-row Undo).
  The Members caption was trimmed to one line (meaning UNCHANGED: sign-in
  required for sharing, creating a card ≠ selecting it). **The Trip/Start
  screens' sharing copy was left byte-for-byte UNTOUCHED** — it's the exact
  string the honesty tests (`requires signing in` / `can't be recalled` /
  never "public") assert against, and this round's brief explicitly scoped
  sharing/honesty copy as behavior-untouched.

Gate: `flutter analyze`; tripboard's full applet-JSON test suite (updated —
not just re-passed — for the three legitimately-changed structures above:
the todo/packing status-chip→checkbox swap, the members dot-vs-icon
precedence, and the dropped dead expand props on todo/packing) +
`test/tripboard_settings_durability_test.dart` unchanged + `applet_lint`
clean; `check_schema_seedversion.sh` (bumped `.5`→`.6` for the `updatedAt`
retype) + `check_compat.sh` (ACKNOWLEDGED via this entry, see above — the
one retype is display-only, zero storage/behavior change). Worktree
`isa-kit/isan-designpass-0728-wt`, branch `feat/designpass-0728`.

## 2026-07-28 — UX round (ux-0728): tap friction, orientation, older-user guide, table icon, freeze investigation

seedVersion `2026-07-28.5`. Real-device user feedback (older users, phone,
prod) drove five JSON-only fixes, no engine change. Board task: Dispatch
"Architecture & implementation" entry `b3c1d2e4-5f60-4a71-8b92-c3d4e5f6a7b8`.

1. **Tap friction.** Every `cards` node across trip/week/todo/packing/notes
   now sets `expandChevron:true` (an existing flutterboard prop, already used
   by krtravel's best_spots/timeline) — the card body tap fires the row's own
   action directly (open the editor, or toggle done for todo/packing), and a
   separate trailing chevron reveals `expandFields`, which now always
   includes the full notes `body` (was missing on todo/packing entirely; week
   plan's expansion used to be just "Week / Added by / Open"). Assignee chips
   kept.
2. **Visual orientation.** Every `cards` node declares `accentColumn` +
   `accentColors` (left stripe): `kind`-keyed on trip/week/notes/activity
   (trip=purple, plan=amber, event=coral, todo=blue, packing=teal, note=pink,
   member=gray), `status`-keyed on todo/packing (todo=blue/teal per screen,
   done=green universally), and `color`-keyed (self-mapped ramp names) on
   Members — so a member's own chosen chip color now also drives their card's
   accent stripe. Members also gained `iconColumn:"emoji"` (leading chip,
   replacing the plain-text emoji subtitle). Every screen got an eyebrow-style
   emoji+label section header (e.g. "🧳 Packing"). Colors are all named ramps
   (`blue/pink/teal/green/purple/gray/amber/coral/red`) resolved identically
   in light/dark theme by the engine's `NodeSpec._ramps` — no new hex values
   invented.
   - **Honest gap, not hacked around:** `tags:[{"column":"author"}]` still
     shows the raw author/assignee ref value uncolored — coloring an
     author/assignee CHIP by the referenced member's own `color` column would
     need a ref-join lookup the `tags` prop doesn't have (it colors by the
     literal column VALUE, not a value resolved through another row). Filed
     as an engine follow-up (`tags` gaining a `colorFromRef`-style join), not
     built here.
   - **No dedicated text-size/density prop exists on `cards`** beyond
     `minCardWidth` (controls column count, not font size) — checked
     `node_schema.dart` directly rather than inventing one. Higher contrast
     this round comes from the accent stripes + eyebrow headers + emoji, not
     a font-scale knob.
3. **Older-user first-time guide.** New `start` screen, first nav item
   ("Start here"), one `card` node per view: emoji + one-sentence description
   + a `"Hint: ..."` caption + a button wired to the existing `goto` action
   (`{"fn":"goto","args":{"screen":"<id>"}}` — flutterboard's
   `functions/misc.dart _goto`, already in the pinned engine, no new fn). Ends
   with a "How sharing works" card that reuses the Trip screen's EXACT
   honest sharing copy verbatim (sign-in required, removal stops new updates
   but can't recall an already-synced copy) — never says "public". A true
   first-run coach-mark overlay (auto-shown once, dismissible) is NOT built —
   that needs host-side first-run state + an overlay primitive the engine
   doesn't have; documented here as a follow-up, not attempted.
4. **Table/grid toggle removed.** Every `cards` node sets `"tableView":
   false` — an existing per-node opt-out (`cards_render.dart`'s
   `showTableView = spec['tableView'] != false`, declared in
   `node_schema.dart`) already covers exactly this; no engine change needed.
5. **Freeze investigation (phone, prod web, intermittent) — NO unbounded
   construct found in tripboard's ui.json.** Checked: (a) every screen body is
   `column[..., cards]` or `column[..., calendar]`/`column[..., glmap]` —
   `cards`/`list` are sliver-capable and windowed BY DEFAULT
   (`BoardRenderer.isWindowed` defaults `true` unless a node opts out;
   `renderer.dart _rootSlivers`/`_boundedRootBody`), so Activity's "every row"
   feed is already lazily built (only on-screen cards materialize), not an
   eager unbounded render; (b) `calendar` and `glmap` are both
   fillPhone/fill-capable and self-bound to a finite height
   (`containsFillPhone`/`isFillCapable` in `renderer.dart`), so neither the
   Calendar month grid nor the Map's `glmap` sits under an unbounded scroll
   body; (c) the member-select `setSetting` → `ThemeSettings` save-path jank
   this round was asked to consider was ALREADY measured and fixed in Round 4
   above (D2a: `_attachAppletSettingsSync` inverted to an allow-list so a
   non-durable `selectRow`/`sel:<table>` write no longer touches
   `ThemeSettings`/`AnimatedBuilder` at all — the ~600ms-per-tap cost that
   review measured is gone for every key except `tripboardMemberId` itself,
   which durableSettings intentionally still persists). No new mitigation was
   written this round because nothing unbounded was found to mitigate.
   **Not reproducible from JSON alone / genuinely engine- or
   environment-level:** the general documented web freeze classes
   (service-worker staleness needing a manual hard-refresh; occasional
   canvaskit-on-mobile click/render hiccups logged repeatedly elsewhere in
   `_claude/knowledge/isa-kit.md`) and the still-`queued` fleet item
   "Residual random lag (minor)" (Dispatch board, parent
   `8ee089da-5095-402b-b78c-254cd03e44d1`) — an app-wide issue, not specific
   to tripboard's JSON, tracked separately.

Plus a light krtravel pass (seedVersion `2026-07-28.2`): `best_spots` and
`timeline` cards gained `accentColumn`/`accentColors` mirroring their
existing `tags` tier colors (a left-stripe reinforcing the same legend) and
`"tableView":false`; the About screen gained a "🗺️ How to read this map"
section explaining the stripe/dot legend. Existing captions on Map/Best
spots/Timeline left unchanged, as scoped.

Gate: tripboard 30+9 new / krtravel 13 (unchanged assertions, additive
accent/tableView props only), applet_lint clean, `check_schema_seedversion.sh`
/ `check_compat.sh` clean (JSON-only, additive props on existing nodes — no
column/table changes on either applet). Worktree
`isa-kit/isan-tripux-0728-wt`, branch `feat/tripux-0728`.

## 2026-07-28 — Round 4: allow-list settings bridge + real S1 gate + doc fixes

seedVersion `2026-07-28.4`. A third Opus adversarial pass APPROVED the D1
share-edge fix (part 3, below) but REJECTED the settings work with a precise
prescription, implemented exactly here — no broader isan change, no
flutterboard change this round. Additive-only schema change (one new
`entries.createdBy` column, `rules.hidden`); `check_compat.sh` confirms.

- **D2a/D2c (persistence bridge inverted deny-list -> allow-list).**
  `app_runtime.dart`'s `_attachAppletSettingsSync` (added part 3, below) used
  to persist EVERY `board.settings` key except a fixed deny-list
  (`_reservedBoardSettingKeys`) — so incidental runtime state never meant to
  survive a relaunch (`sel:<table>` per-screen selection, `_autoEditRow`,
  `bubl*` bubble-board state, migration markers) was durably written AND
  restored right alongside the one key tripboard actually wanted
  (`tripboardMemberId`). Fixed by inverting the model: `AppManifest` gains a
  `durableSettings` field (`Set<String>`, parsed from app.json's new
  `durableSettings` array), and both halves of the bridge now filter
  BEFORE touching `ThemeSettings` — the write-back (`_attachAppletSettingsSync`)
  snapshots only keys in the manifest's allow-list (so a non-durable settings
  write, e.g. `sel:entries` on every row selection, never reaches
  `ThemeSettings.setAppSetting`, never fires its `notifyListeners`/JSON-doc
  write — the ~600ms-per-`selectRow` cost the part-3 review measured via
  main.dart's `AnimatedBuilder` is now zero for every non-durable key), and
  the restore (`restoreDurableAppSettings`, a new pure `@visibleForTesting`
  function) filters the same way before merging over the fixed engine slots.
  `apps/tripboard/app.json` declares exactly `"durableSettings":
  ["tripboardMemberId"]`. `ThemeSettings._appSettings` is now stored TYPED
  (`Map<String, dynamic>`, was `Map<String, String>`) — `setAppSetting`/
  `appSetting`/`appSettings` no longer stringify, so a bool round-trips as a
  bool (the part-3 review's probe: a bool persisted as `"true"` broke
  equality on restore).
- **D2b (web had NO durability at all).** `theme_io_web.dart` used to keep
  the whole prefs doc in a bare in-memory variable — so NOTHING survived a
  page reload on web, the platform's PRIMARY surface, despite this file's own
  durability claims. Now backed by `window.localStorage` (via `package:web`),
  mirroring `sync/sync_io_web.dart`'s exact pattern: an env-prefixed key
  (`<prefix>theme_settings`, distinct from sync's `<prefix>settings`),
  read-through on load, write-through on save, falling back to an in-memory
  copy if `localStorage` itself throws (quota denial / disabled storage)
  rather than crashing. **Durability is per-platform, honestly**: native
  (desktop/mobile) and ordinary (JS-compiled) web are durable; a
  **dart2wasm** web build still routes to `theme_io_stub.dart` (no-op —
  `dart:html` genuinely doesn't exist under wasm, so this codebase's existing
  `dart.library.html` conditional-import selector, the same one
  `sync_io.dart` already uses, falls through to the stub there) — session-only
  in that one compile target. `theme_io_stub.dart`'s doc comment now says so
  explicitly.
- **D2d (durability tests only exercised `_toJson`/`_fromJson`, never the
  actual bridge).** The part-3 durability tests never called
  `_attachAppletSettingsSync` at all — `ThemeSettings.current` is null under
  `flutter_test` (the real singleton hangs on a `path_provider` platform
  channel), so both halves of the real bridge would have silently no-opped if
  a test had tried. Minimally restructured the bridge's seam for injection:
  `_attachAppletSettingsSync` and the restore half now take an explicit
  `ThemeSettings`/`durableKeys` parameter (`attachAppletSettingsSyncForTest`,
  `@visibleForTesting`, wraps the private function for test callers).
  `test/tripboard_settings_durability_test.dart` gained real-bridge cases: an
  allow-listed key round-trips TYPED through a real `BoardState` +
  `ThemeSettings.forTest` fixture; `sel:entries`/`_autoEditRow` are proven
  NEITHER persisted (the durable doc holds exactly the allow-listed key,
  nothing else) NOR restored even from a tampered doc; the five host literals
  (`playerId`/`autosave`/`confirmDeletes`/`liveSeconds`/`slmBaseUrl`) are
  proven un-clobbered even when a tampered doc smuggles same-named keys into
  the applet's own bucket; and a second `appId` is proven fully isolated
  (same key, no bleed either direction).
- **S1 gate made real (the type stamp alone was inert).** Part 3 stamped
  `type: "note"` on note-kind rows so `share_sink.dart`'s `levelMayPush`
  would recognize them, but `levelMayPush`'s commenter branch ALSO requires
  `authoredBySelf` — which comes from `rowAuthoredBySelf`, which reads
  `row['createdBy']` against the signed-in PocketBase user id. Tripboard
  never stamped `createdBy` at all (only `author`, tripboard's OWN
  `tripboardMemberId`-keyed attribution, deliberately never `$playerId` —
  see F3/D-round-3 below), so `authoredBySelf` was always false and the type
  stamp alone changed nothing. Fixed by adding a hidden `entries.createdBy`
  text column (plumbing only, `rules.hidden`, never shown in the record
  editor — kept fully separate from `author`, which must never key off
  sign-in) and stamping `"createdBy": "$playerId"` on all 11 `addRow` create
  actions in `ui.json` (resolves to the signed-in PB user id via
  `board.settings['playerId']`, or an empty/local value when signed out —
  verifier-confirmed harmless either way: a phantom `users/<id>` scope key
  from `share_scope.dart`'s `userRefFields` resolves via `rowFor` to null and
  is skipped, never an error). The `type` column + its note-only stamp are
  unchanged (the kind gate runs AFTER `authoredBySelf` passes — both still
  required). Verified BOTH directions with the real `levelMayPush` +
  `rowAuthoredBySelf` fired through real `ui.json` addRow actions on a real
  `BoardState` with `playerId` seeded (`test/tripboard_applet_test.dart`): a
  commenter pushes their own note (`createdBy` == their id) — allowed; the
  SAME commenter pushing their own todo, or a note authored by someone else —
  denied both ways.
- **Doc fixes.** This file's part-3 entry cited a nonexistent
  `test/tripboard_addrow_link_test.dart` — the real regression test lives in
  `test/tripboard_applet_test.dart` (corrected above); its "30 tests" claim
  was also wrong (the actual applet suite is not a hand-counted number
  quoted in prose going forward — count it directly:
  `grep -c "^  test(" test/tripboard_applet_test.dart`). Durability claims
  are now stated per-platform (native + ordinary web: durable; wasm web:
  session-only) rather than as a single blanket claim.

### Honest gaps still open (this round)

- Silent no-edge on a typo'd `link.table` in an `addRow` action spec would
  fail the same way defect-1 (part 3) originally did, just for a
  hand-authored applet with a typo instead of a missing param — nothing in
  `applet_lint.dart` catches a `link.table`/`link.type` value that doesn't
  match a real relations edge shape. Candidate applet-lint rule, not
  attempted this round (out of the settings-fix scope this round's brief
  specified).
- A `historybar`-using applet with a `link` param on its `addRow` action
  double-captures the same insert in its undo stack (once for the row, once
  for the auto-written edge) — tripboard itself has zero `historybar` nodes
  (F4) so this never fires here, but it's a real engine-level double-undo-
  capture gap for any applet that combines the two, noted for a future
  engine round.
- The dangling-author raw-id gap (S4, part 3) is unchanged — a deleted
  member's `author` ref still renders its raw id rather than a friendly
  "removed member" label.
- The settings bridge has no DELETE path: `board.setSetting(key, null)`
  removes the key from `board.settings`, but `_attachAppletSettingsSync`'s
  flush only iterates the keys PRESENT in the new snapshot, and
  `ThemeSettings.setAppSetting` only ever writes — so a cleared durable key
  stays in the per-install doc and is restored on the next open. Not
  reachable in tripboard (its one `setSetting` action always supplies the
  firing member row's id, never null), so nothing here can hit it; a real
  gap for any future applet that needs to CLEAR a durable setting.
- Everything under "Honest gaps still open" in the part-3 and part-2 entries
  below is still open, unchanged.

## 2026-07-28 — Adversarial re-review fixes (tripboard-0728, part 3)

seedVersion `2026-07-28.3`. A second Opus adversarial pass REJECTED commit
`c6d30e4` (the part-2 rebuild below) on two BLOCKING defects plus four
secondary items. Additive-only schema change (one new `entries.type` column,
`rules.hidden`); `check_compat.sh` confirms.

- **Defect 1 (BLOCKING) — runtime-created rows never entered the share.**
  All ten-plus `addRow` create actions wrote a bare `entries` row with no
  `relations` edge, so `share_scope.dart`'s `subtreeClosure` BFS (which walks
  LIVE `contains` edges) never reached anything created after the seed —
  verified: new rows had `inScope=false`. Fixed at the ENGINE level:
  flutterboard's `addRow` now takes an optional `link: {table, fromId, type}`
  and writes one `{fromId, toId: <newId>, type}` edge atomically with the
  insert (`$uuid` re-randomizes per resolution, so a chained addRow + separate
  edge-write action could never reference the id addRow just assigned — see
  `flutterboard/lib/src/functions/rows.dart` `_addRow`). Every one of this
  applet's `entries`-creating `addRow` actions in `ui.json` now declares
  `"link": {"table": "relations", "fromId": "trip_root", "type": "contains"}`,
  matching the seed data's own edges exactly (`content.json`'s `rel_1..13`).
  Landed on flutterboard `dev` (merged commit `0f5558b`); `fb-dev` pin
  refreshed to that SHA (session-local `pubspec_overrides.yaml`, not
  committed). Regression test: `test/tripboard_applet_test.dart` (the "every
  real addRow action in ui.json fired through a real BoardState..." case)
  fires the REAL `ui.json` addRow specs through a real `BoardState` and
  asserts `subtreeClosure('trip_root', ...)` contains every newly created id
  — see the round-4 entry below for the current suite size and a doc-accuracy note.
- **Defect 2 (BLOCKING) — `tripboardMemberId` was per-SESSION only, despite
  being DOCUMENTED as per-install.** `BoardState.setSetting` only ever
  mutated an in-memory map; `app_runtime.dart` rebuilt `board.settings` from a
  fixed literal on every app open, so the setting evaporated on restart and
  rows silently stamped `author: null` thereafter. The part-2 entry below and
  `app.json`'s `meta.note` calling this "a per-install... SETTING" were true
  of the *identity concept*, not the *implementation* — now they are. Fixed
  by wiring the ALREADY-SHIPPED two-tier applet-settings system
  (`ThemeSettings` in `lib/src/theme/theme_settings.dart`, the same local
  per-install JSON doc that already durably stores `_appPrefs`/`_appStyles`/
  `_appAddonsOff`/`_localActorId` per `appId` — never a DB row, never part of
  `DbBundle`, so it can never reach `share_rows`/sync): a new parallel
  `_appSettings` map (`appId → key → string value`) with `appSetting`/
  `appSettings`/`setAppSetting`. `app_runtime.dart` restores it into
  `BoardState.settings` at open (`...?ThemeSettings.current?.appSettings(cfg.
  manifest.id)`, spread OVER the fixed engine slots so a restored value always
  wins) and a new debounced `board.addListener` bridge
  (`_attachAppletSettingsSync`) writes back any FUTURE change to a
  NON-reserved key (`_reservedBoardSettingKeys` excludes `slmBaseUrl`/
  `autosave`/`confirmDeletes`/`liveSeconds`/`playerId` — the engine's own
  fixed slots can never be persisted this way, only genuine applet-written
  keys like `tripboardMemberId`). No flutterboard engine change needed — the
  bridge lives entirely in isan, listening on the existing `ChangeNotifier`.
  Regression test: `test/tripboard_settings_durability_test.dart` simulates a
  restart (fresh `BoardState` + re-run the restore step) and confirms the
  setting survives.
- **S1 — commenter-level collaborators could push NOTHING.**
  `share_sink.dart`'s `levelMayPush` gates `entries` pushes on `row['type']`
  (Dispatch's discriminator), but tripboard uses `kind` instead — so
  `row['type']` was always null and every commenter-authored row was
  silently dropped. Added a `type` column (`rules.hidden`, plumbing only) and
  stamp `type: 'note'` on the two note-creating `addRow` actions — `note` is
  tripboard's one kind with a genuine Dispatch-vocabulary counterpart
  (`kCommenterCreatableKinds`). A commenter can now push their own notes;
  every other kind (plan/event/todo/packing/member) stays editor-gated in v1
  — an honest, not faked, boundary (stamping a `type` those kinds don't
  actually match would be the fake version).
- **S2 — an untyped shared-mount row leaked into Activity.**
  `app_screen.dart`'s shared-mount path (`ensureGroup`) inserts an `entries`
  row with `type: 'group'` and no `kind` for the "Shared with me" grouping —
  Activity had no `filter` at all, so this plumbing row rendered as a blank
  card. Added `"filter": {"column": "kind", "in": [trip, member, plan, event,
  todo, packing, note]}` to Activity's `cards` node. (Map/`glmap` needed no
  change — it implicitly filters to rows with both `lat`/`lon` set, which the
  untyped row never has.)
- **S3 — Members screen copy overclaimed.** "create your own member card
  below, or tap an existing card to set it as you" implied creating a card
  also selects it; it doesn't (creating and selecting are two separate
  actions — a chained `addRow` → `setSetting` can't reference the new row's
  id via the engine's chain mechanism, so wiring it up is a real engine
  change, not attempted here). Copy corrected to state the two-step flow
  explicitly.
- **S4 — a deleted member's id renders raw in author chips.**
  `renderer.dart`'s ref-label resolution (~L4991) falls back to the raw id
  when the referenced row is gone. Not fixed here (no clean engine change
  within this round's scope) — recorded as a known gap below.

### Honest gaps still open (this round)

- S4 above: a deleted member's id shows raw, not a friendly "removed member"
  label — future engine round on `renderer.dart`'s ref-label fallback.
- S3's "create then auto-select" flow needs a chain mechanism that can pass a
  freshly-created row's id to a later step in the same chain (today only the
  host-side `afterAddRow` callback sees it) — a real engine change, out of
  scope this round.
- Everything under "Honest gaps still open (carried over, not attempted
  here)" in the part-2 entry below is still open, unchanged.

## 2026-07-28 — REBUILD after adversarial review (tripboard-0728, part 2)

seedVersion `2026-07-28.2`. An Opus adversarial review REJECTED the initial
applet below (F1–F5, full findings in `_claude/projects/tripboard-spec.md`).
This is a from-scratch schema rebuild, not a patch — old tables are GONE, not
migrated (no real installs existed yet). **CORRECTION to the entry below: its
"`BoardState.addRow` upserts" claim is FALSE.** `addRow` always INSERTS a
fresh row; `DataTable.upsert` REPLACES the whole row wholesale on a second
call with the same id, and isan's `afterAddRow` opens an isNew editor whose
back-out DELETES that row. Any design that re-taps `addRow` against an
existing id (as v1's "This is me" flow did) is unsafe. This rebuild never
does that.

**What changed and why:**

- **F1 (sharing silently dropped custom tables).** `apps/tripboard`'s
  `members`/`plans`/`events`/`todos`/`packing`/`notes` tables are GONE.
  Everything now lives in ONE `entries` table (`kind`: trip|member|plan|
  event|todo|packing|note) plus a `relations` table (`{fromId, toId, type}`,
  `contains` edges from the trip root) — the ONLY table names the share
  pipeline recognizes (`share_scope.dart` `subtreeClosure`, `share_sink.dart`
  `rowFor`, `project_share_controller.dart`). Shape mirrors Dispatch's own
  `entries`/`relations` exactly (verified against `apps/dispatch/tables.json`
  + `columns.json`), so the same closure walk that already works for Dispatch
  works here unmodified. Verified with a REAL `subtreeClosure` call against
  the real seed content in `test/tripboard_applet_test.dart` — every seeded
  row is reachable from `trip_root`.
- **F2 (addRow replaces, doesn't merge) / F3 (identity flips on sign-in).**
  Identity is now a per-install board SETTING, `tripboardMemberId` — never
  `$playerId`, never anything sign-in-derived. "This is me" has two paths,
  neither of which re-taps an existing row via `addRow`: (a) create a NEW
  member entry (`addRow`, fresh id — safe, it's a genuinely new row) or (b)
  tap an EXISTING member card, which calls `setSetting` with no explicit
  `value` — the new flutterboard `setSetting`-row-id-default behavior (see
  Engine change below) writes THAT row's own id into `tripboardMemberId`, no
  `addRow` involved at all. Every content-creating action stamps
  `author: "$setting:tripboardMemberId"` (the addRow value-token resolution
  from the prior round, confirmed still present in `fb-dev` at commit
  `dffcced`+). Signing in later cannot touch this setting — nothing in the
  applet ever reads or writes it from `$playerId`.
- **F4 (historybar unsafe with a 2nd writer).** Zero `historybar` nodes
  anywhere in `ui.json` now (was on Week board + Members). Activity is the
  audit trail; per-row delete still shows a normal Undo toast. The
  whole-board-snapshot undo/redo stack remains a known ENGINE-level gap —
  recorded here and in `_claude/projects/tripboard-spec.md`, not something
  this applet works around.
- **F5 (tautological tests).** `test/tripboard_applet_test.dart` was
  rewritten top to bottom: a real `subtreeClosure` (share_scope.dart) run
  against the real seed content, per-kind author-token assertions, a zero-
  historybar assertion, todo/packing done-state-mechanism assertions, copy-
  honesty greps, and a cross-view single-table assertion. No test asserts a
  string against itself.
- **Minor: `list` → `cards` for todo/packing.** `list` has no
  `statusColumn`/done rendering in `node_schema.dart`; the old copy's "tap to
  check off" was aspirational. Todo/Packing now use `cards` (which supports
  `filter`, needed for the single-table kind split) with an explicit
  `toggleField` action plus `accentColumn`/`tags` on the `status` column, so
  done-state is genuinely visible and wired, not just implied by copy. **Known
  engine gap, NOT fixed here:** no node type currently combines table-level
  `filter` with a native `statusColumn`/`onToggle` checkbox — `buckets`/
  `tree`/`agenda` have the checkbox but no `filter`; `cards` has `filter` but
  no native checkbox. Flagged as a clean, small, additive follow-up
  (`filter` on `buckets`/`tree`/`agenda`) rather than scope-crept into this
  round.
- **Minor: `updatedAt` is now genuinely display-only.** `rules.hidden: true`
  keeps it out of the record editor (previously it was a plain, silently-
  editable column even though the engine overwrites it on every save
  regardless). Never appears in any `addRow` `values` map (asserted by test).
- **Map collapses to one table.** `glmap` (was two stacked `map` widgets on
  `events`/`notes`). Since `glmap`/`map` have no `filter` prop, pins are
  simply every `entries` row with both `lat`/`lon` set — in practice only
  `event`/`note` kinds ever populate those columns, so this is a correct,
  if implicit, filter. Documented as a deliberate design call, not an
  oversight.
- **Sharing copy corrected.** The Trip screen states sign-in is required for
  sharing, names people ("share it with Ana and Sam" — never "public"), and
  states the honest can't-recall-a-synced-copy caveat per
  `_claude/projects/sharing-data-model.md`. `shareProject`/`projectSettings`
  are wired as plain in-card BUTTONS (matching how `openActions`/explicit
  buttons actually render) — no copy claims a "⋮" kebab menu, which
  `cards`'/`explorer`'s real menu affordances don't look like here.

### Engine change this rebuild required (flutterboard, additive)

`setSetting` already existed (`board.setSetting`, applet-JSON-invokable,
`args: {key, value}`) and `$setting:<key>` value-token resolution on `addRow`
already existed (landed the prior round, `dffcced`) — confirmed by grep
before writing any new engine code, per this round's brief. What was
genuinely missing: no way for a plain row-tap action (a `cards` item's
`action`) to write THAT row's own id into a setting — `setSetting` only ever
took an explicit literal `value`. `flutterboard`
`feat/tripboard-setsetting-rowid-0728` (merged to flutterboard `dev` at
`83e4824`) makes `setSetting`'s `value` default to `ctx.id` (the firing row's
id, which already resolves `$selected:<table>`) when the args map omits
`value` entirely — the same "defaults to the firing row" convention
`selectRow` already uses. Fully additive; an explicit `value` still wins.
Tests: flutterboard `test/set_setting_rowid_test.dart` (5 cases). This
worktree's session-local `pubspec_overrides.yaml` pins `flutterboard` to the
refreshed `fb-dev` pin (now `83e4824`) — not committed.

### Honest gaps still open (carried over, not attempted here)

- Bare-link-no-identity sharing, sign-in required to invite, unverified
  live-sync server migrations — unchanged from the prior round.
- Whole-board undo/redo remains multi-writer-unsafe at the ENGINE level (F4)
  — no applet-level workaround exists; this is a future engine round.
- No `filter` prop on `buckets`/`tree`/`agenda` (see Minor note above) — a
  real, confirmed schema gap, flagged for a follow-up engine round, not
  fixed here.
- Map tap-to-add (an empty-area tap creating a pinned note) is still not
  built — `glmap`'s prop list has no such affordance either (same gap as
  `map` had).

## 2026-07-28 — Initial applet (tripboard-0728) — SUPERSEDED, see rebuild above

seedVersion `2026-07-28.1`. New applet — no prior schema, nothing to migrate
from. Tables: `members` (3 seed rows), `plans` (3), `events` (2), `todos` (2),
`packing` (2), `notes` (2) — one example trip "Korea trip — Aug-Oct" with
three example members (Ana/Sam/You); every seed row title/item/note is
labeled "(example)" or otherwise clearly placeholder, no personal data.

Built per `_claude/projects/tripboard-spec.md`. Author attribution on every
content table (`plans`/`events`/`todos`/`packing`/`notes`) uses a `ref`
column (`author` → `members`) stamped at row-creation time with `$playerId`
(this device's stable local identity) — see the flutterboard engine change
below, which this applet's design REQUIRED.

### Engine change this applet required (flutterboard, additive)

Investigation found `setField`/`setFields` already resolved value tokens
(`$playerId`/`today`/`now`/`uuid`) on EXISTING rows, but `addRow`'s `values`
map wrote them verbatim — there was no way for a plain JSON `addRow` action to
stamp a brand-new row with the acting device's identity. `flutterboard`
`feat/tripboard-addrow-tokens-0728` (merged to flutterboard `dev` at
`dffcced`) extends the same `resolveValueToken` pass to `addRow`, and adds a
new `$setting:<key>` token (arbitrary `board.settings` lookup) alongside the
existing fixed `$playerId` slot. Tripboard only ended up needing `$playerId`
(see Identity below), but `$setting:<key>` is additive/generic and documented
for any future applet keeping its own local-identity setting. Tests:
flutterboard `test/addrow_value_tokens_test.dart` (5 cases). Session-local
`pubspec_overrides.yaml` in this worktree pins `flutterboard` to the refreshed
`fb-dev` pin (`dffcced`) until the next isan `integrate.sh` run refreshes it
generically — not committed.

### Identity — no `prefs` table needed

`board.settings['playerId']` is already a stable per-install device id, freshly
set by the host at every boot (`ThemeSettings.current?.localActorId`, or the
signed-in account id) — durable across restarts with zero app-level plumbing.
Tripboard's "who are you on this trip?" flow creates/edits a `members` row
whose **id IS that device's `$playerId`** (`addRow` with an explicit
`values.id`, which `BoardState.addRow` upserts — tapping "This is me" again
just re-opens the SAME row's editor, doubling as "edit my profile"). Every
content-table `addRow` then stamps `author: "$playerId"`, and the `ref` column
resolves it to that member's name/color/emoji wherever it's displayed — no
separate `prefs` table, no cross-table value-copy action needed.

### Honest gaps vs. the spec (see tripboard-spec.md's own "Honest gaps" too)

- **Map tap-to-add is NOT built.** The spec assumed the real `map` node could
  bind an "add note here" action to an empty-area tap; the node's actual prop
  list (flutterboard `node_schema.dart` ~L1291-1360) has no such prop — only
  `action` (tap an EXISTING pin) and `userLocation` (show my own position).
  Adding a location note is a plain "New note" button + editable lat/lon
  fields on the Notes screen; a saved note with lat/lon then appears as a pin
  on the Map. Not an engine-change candidate for v1 (a UX nicety, not a
  functional blocker) — flagged as a clean follow-up (a `glmap`
  `pinMode`/`pinsTable` pin-then-edit flow).
  - relatedly, Map is not a single view — it's two stacked `map` nodes
    (Trip places on `events`, Pinned notes on `notes`), since the real `map`
    node's `table` prop takes exactly one table (confirmed, no
    multi-table/multi-layer binding). Both still read the SAME tables the
    Calendar/Notes screens use — cross-view sync is intact, just two widgets
    instead of one.
- **`author`/`updatedAt` replace the spec's literal `author`/`updated`
  columns.** `updatedAt` is the engine's own auto-stamped per-row timestamp
  (`BoardState.addRow`/`updateRow` set it on every write already) — reusing it
  instead of a hand-maintained `updated` avoids a column nobody would keep in
  sync. `author` is a real `ref` column (not a bare id string) so
  list/cards/activity views show a resolved name automatically (confirmed via
  the engine's existing ref-label resolution, `renderer.dart` ~L4978-5030) —
  no `authorName` denormalization needed either.
- **Activity is 5 per-table `list`s, uncapped.** `list` has no `limit` prop in
  the current schema; each list sorts `updatedAt desc` (most recent first)
  but shows all rows rather than a hard-capped N. Matches the spec's stated
  "ship the per-table version first" call; the "capped to recent N" phrasing
  is aspirational until a `limit` prop exists on `list`.
- **`historybar` is not on every screen.** There is no shared/global header
  slot in the current screen schema (each screen owns its own `body` column) —
  it's placed on Week board and Members only, not on all 7 screens. A true
  global toolbar would be a separate, larger structural change, well beyond
  this applet.
- Everything under the spec's own "Honest gaps" section (bare-link-no-identity
  sharing, sign-in required to invite, whole-board-snapshot undo, unverified
  live-sync server migrations) carries over unchanged — this build does not
  attempt to close any of those.
