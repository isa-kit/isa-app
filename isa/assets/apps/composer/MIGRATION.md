# composer (Moku) — schema migrations

## 2026-09-04 — native Wikipick redesign frames (moku-native-frames-0903)

**What changed.** The "Wikipick redesign" board's 10 frames were image-backed
captures (`frameImages` rows, one PNG screenshot per frame) — viewable in the
canvas/frame-review layer, but not editable: there is no widget tree behind a
stored image, so the review layer's Edit action (`ComposeFrameReview.
isImageFrame`) hides itself for them. This round converts all 10 to NATIVE
Moku frames: real `screens`/`widgets` rows composed from the compose node's
own widget vocabulary (titlebar/searchbar/list/text/card/buttonrow/settings/
popup), which the Edit action opens directly in Moku's existing screen
editor — the same board data, nothing new to build for co-design read-back.

- `screens`: unchanged rows, same ids/positions/statuses (8 approved,
  2 proposed) — only the `frameImages` row for each is removed and replaced
  by `widgets` rows on the same screen id.
- `widgets`: +48 rows across the 10 screens (see
  `lib/src/composer_native_wikipick_migration.dart`'s
  `composerNativeWikipickFrameWidgets` map for the authoritative per-screen
  list — kept in lockstep with `content.json` by
  `test/composer_native_wikipick_migration_test.dart`'s parity check).
- `frameImages`: the 10 rows for these screens are removed. No other
  `frameImages` rows exist in the seed, so the table is now empty in
  `content.json` (a future image-backed frame is still fully supported —
  the table stays in the schema).
- `boards.rev`: bumped 6 → 7 for `bd_wikipick_redesign`.
- `columns.json`: `widgets.kind`'s enum gained `dropdown`/`popup` — these
  kinds were already implemented by the compose node (flutterboard's
  `compose.dart`) but missing from this applet's own enum list, which only
  affects the inspector's kind picker (data values were never validated
  against it).
- `app.json`: `seedVersion` bumped to `2026-09-04.native-wikipick-frames`.

**Existing-install migration.** composer is `seedContent: "initial-only"`
(`app.json`), so a plain `content.json` rewrite reaches a FRESH install only
— anyone who already has this board (it shipped 2026-09-03, commit
`b1d16035`/prod `b6263b9d`) keeps their old image rows forever unless
something migrates them. `lib/src/composer_native_wikipick_migration.dart`'s
`installComposerNativeWikipickFrames` runs once from
`runLegacySeedMigrations` (`appId == 'composer'`) and does the same
conversion against a live store:

- **Content-aware, "user edits win"** (mirrors the seed-plant-once rule): for
  each of the 10 reserved screen ids, it only acts while the ORIGINAL
  `frameImages` row is still present AND the screen has no widgets yet.
  - Image already gone (user replaced/deleted it, or a previous run already
    converted it) → left alone.
  - Widgets already present (user started composing on it natively, or it
    was already converted) → left alone, even if the stale image row is
    somehow still there.
  - Otherwise (untouched bundled frame) → the native widget rows are
    inserted, then the image row is deleted.
- Additive-only and idempotent: never touches a row it didn't insert itself,
  safe to run every boot.
- The per-screen widget rows this installs are IDENTICAL (by id) to the ones
  `content.json` now ships for a fresh install — a migrated existing store
  and a fresh install converge on the same data. Verified by
  `test/composer_native_wikipick_migration_test.dart`.

**What this does NOT touch:** the 3 sticky notes (`stickies`), and the
`pins`/`flows` tables (both empty in this seed) are unaffected by either the
content.json change or the migration.

## 2026-09-03 — design-review layer + Wikipick-redesign seed (mokufinish-0903)

seedVersion `2026-08-20.items-and-folders-columns` → `2026-09-03.design-review-wikipick-seed`.

**Additive, non-breaking.** Three new tables (`stickies`, `pins`,
`frameImages`) and two new columns (`boards.mode`, `boards.rev` already
existed conceptually as an engine default but is now declared; `screens.status`)
— no table, column, or type is removed or retyped. The applet id (`composer`)
and store namespace (`isan_composer`) are UNCHANGED.

### What changed

Turns on flutterboard's opt-in `compose` design-review layer
(`feat/moku-design-canvas-0902`, engine commits c6c1543/fcf45e9/ca3f19c) via
new keys on the existing `compose` node in `ui.json`: `review: true`,
`boardModeColumn: "mode"`, `screenStatusColumn: "status"`,
`frameImagesTable: "frameImages"`, `stickiesTable: "stickies"`,
`pinsTable: "pins"`. Every column name matches the engine's own defaults, so
no column-name override keys were needed beyond declaring the tables exist.

`boards.mode` (design/edit, default `edit`) and `screens.status`
(proposed/approved/changes, default `proposed`) are additive columns with
defaults, so every EXISTING board and screen opens exactly as it did before
this change — byte-identical, per the engine's own contract for the review
layer being off unless a board explicitly carries `mode: design`.

### The seed: "Wikipick redesign"

One new board (`bd_wikipick_redesign`, `mode: design`, `rev: 6`), 10 screens
(image-backed frames captured headless at exactly 390x844 from
`_claude/projects/moku-canvas-handoff/*.dc.html` via
`Google Chrome --headless --screenshot --window-size=390,844`), 8 `approved` +
2 `proposed` (TopicMode, TopicBuilder — the two genuinely new proposals per
the handoff doc; ResultMenu is `approved` per the handoff's explicit
literal-brief-over-mockup-legend reconciliation), and 3 sticky notes carrying
the source canvas's design annotations (`empty-state-rule`,
`topic-mode-proposal`, `result-menu-proposal`).

Every frame image is PNG except `img_wr_main` (Article reader), re-encoded to
WebP (`cwebp -q 85`) because the PNG capture was 121KB base64-encoded — 1KB
over the ≤120KB/row budget (CursorWindow 2MB scar, one image per row). Every
other row stayed PNG, all comfortably under budget (37.6–83.7 KB
base64-encoded). `frameImages.mime` records the real format per row; the
engine's `composeFrameImageBytes` reader does not branch on it (`Image.memory`
auto-detects PNG/JPEG/WebP), so mixed formats in one table is safe.

`seedContent: "initial-only"` is retained (already present pre-change), so
this seed plants once on a fresh install and never re-plants for an existing
one on a `seedVersion` bump — the standing "seed re-plants on bump" scar does
not apply here.

### Tests covering this change

- `test/compose_design_canvas_test.dart` (flutterboard, engine-side) — the
  full review-layer contract, including the two new cases added this round
  (Edit-frame wiring, image frames have no Edit action).
- No new isan-side test was added this round for the seed content itself;
  see the open item in `_claude/projects/moku-canvas-handoff/HANDOFF.md`.
