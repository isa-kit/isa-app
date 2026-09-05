# taskly (Taskly) — schema migrations

## 2026-08-17 — multiple boards: the `board` column + a current-board switcher (multiboard-0817)

seedVersion `2026-08-16.v2-rebuild.2` → `2026-08-17.multiboard.1`.

**Additive, non-breaking.** One new column (`entries.board`, a ref into
`entries`); no table, column, or type is removed or retyped, so
`tool/check_compat.sh` reports an additive change only. The applet id
(`taskly`) and store namespace (`isan_taskly`) are UNCHANGED.

### What changed

taskly went from ONE agenda root to several `kind: board` roots: the seeded
personal agenda, boards the user creates (a trip, a project), and boards
joined from someone else's share. A durable `tasklyCurrentBoard` setting names
the board in view; every task view filters on it, and every creation path
stamps it.

Each item now carries its board TWICE, on purpose — the two mechanisms are
independent and neither can be derived from the other at read time:

| | what it is | what reads it |
|---|---|---|
| `contains` edge | `relations` row, board root → item | the SHARE subtree walk |
| `board` column | ref value on the item | every task VIEW's filter |

### What happens to existing data

Nothing is lost and nothing needs a reset. On load,
`migrateTasklyBoards` (isan `lib/src/taskly_migration.dart`, dispatched from
`host/legacy_migrations.dart`) stamps `board = board_root` on every existing
`task`/`event`/`note` row that has no board value — they were all, in fact, in
the personal agenda.

`_tasklyBoardsHealed` looks like a once-per-install guard but is not one, **by
design**: it is written into the in-memory settings map and never persisted
(only keys on the manifest's `durableSettings` allow-list survive a relaunch,
and this one is deliberately absent). It suppresses a second pass within a
session; the backfill itself re-runs every boot. That is what makes a savepoint
restore self-healing — rows recovered from a backup that predate the column get
stamped on the next launch instead of staying invisible forever — and it also
mops up anything orphaned during a fail-open window. The pass only ever writes
a board value onto a row that has NONE, so a row you have since moved to
another board is never dragged home. **Do not add `_tasklyBoardsHealed` to
`durableSettings`**: that would make the backfill genuinely once-only and
reintroduce the restore hazard.

`member` rows and activity-log comment rows are deliberately NOT stamped. They
are global per install, and a blank board value falls outside every board
filter, which is exactly how the old kind-only filters kept them out of the
task views. Stamping them would push log comments into Today.

### The one thing to be careful about

An EMPTY `tasklyCurrentBoard` is not a cosmetic problem. The engine's two
contracts for an unresolved `$setting:` token differ by design: a `filter`
fails OPEN (no constraint — every board's rows mix into one list) while an
`addRow`/`toggleDone`/`importIcs` `link.fromId` SKIPS the link (a new item
with no edge to any root — invisible to sharing, permanently, with nothing in
the UI to say so). So the setting half of the heal runs on EVERY boot, NOT
once behind the `_tasklyBoardsHealed` guard, and it also re-points the setting
whenever it names a row that is no longer a live board (the joined-then-
unshared case). `test/taskly_multiboard_test.dart` holds a falsifying test for
each of those three properties.

One related engine asymmetry is handled host-side rather than in the applet:
`importIcs` spreads its `values` map into imported rows RAW (unlike `addRow`,
which resolves value tokens), so `buildIcsImportArgs` in
`lib/src/app_screen.dart` resolves them at the call site. `link.fromId` is
still forwarded verbatim — the engine resolves that itself, per row.

### The `board` column is not editable

It is declared `hidden`, so the record editor does not offer it. A visible ref
picker over every board reads as "Move to board" but is only half of one:
changing the column moves the item between VIEWS while leaving the `contains`
edge — and therefore share membership — untouched, so an item apparently moved
out of a shared board would keep syncing to that board's members. The Details
screen still SHOWS the board read-only (its `record` names the column in an
explicit `fields` allow-list, which overrides `hidden`).

### Not in this round

A real **Move to board** action, rewriting the column AND the edge together.
Until it exists there is no move control at all, which is the safe state.

Deleting a board. The fate of a deleted board's items (delete with it? move
home? orphan?) is unresolved, so the Boards screen offers add, rename, and
switch only.

## 2026-08-16 — v2 rebuild: four private tables → the shareable `entries`/`relations` graph (tasklyv2-0816)

seedVersion `2026-06-15.recurring` → `2026-08-16.v2-rebuild`.

This is an **acknowledged BREAKING schema change**: `tool/check_compat.sh`
reports four removed tables (`tasks`, `notes`, `profiles`, `templates`), and
this file is the audit trail that accepts it. The applet id (`taskly`) and the
store namespace (`isan_taskly`) are UNCHANGED and must never change.

### Why the break was unavoidable

v1 could never be shared, and no additive change could fix that. isan's share
pipeline (`lib/src/sync/share_scope.dart`) syncs only tables **literally
named** `entries` / `relations` / `users`, and the server enforces the same
list. Every one of v1's four table names was therefore silently dropped when
someone was invited — the applet looked fine locally and shared nothing. The
"additive fix" the compat gate normally recommends (keep the old column, add a
new one, convert on read) does not apply to a *table-name* constraint imposed
by a different subsystem: the rows have to live in a table called `entries` or
they are not shareable, full stop.

The new shape is the one already proven by `dispatch`, `tripboard` and
`krtravelplan`: one `entries` table with a `kind` discriminator, plus a
`relations` table of `{fromId, toId, type: contains}` edges that the share
subtree walk follows from the agenda root.

### What happens to existing v1 data — and what does NOT

**There is deliberately no automatic migration code, and this section is the
reason that is a defensible choice rather than a shortcut.** The mapping is not
faithful in either direction: v1 `tasks` were a self-referencing tree
(`parentId`), v1 `templates` were reusable process skeletons with steps, and
v2 has neither a task tree nor templates. Auto-flattening a tree into dated
agenda rows would invent structure the user never wrote and silently drop the
rest. A migration that quietly loses data is worse than an honest reset.

What protects the old data instead is a property of the schema merge, which is
**verified by an existing test, not assumed**:

- `mergeSchema` (isan) KEEPS saved tables and columns that the bundled docs no
  longer declare. Covered by `test/schema_merge_test.dart`, case
  *"keeps user-added table + column, adopts bundled new column"* — its
  `places` table exists only in the saved store and survives the merge with
  its columns intact. A v1 install's `tasks`/`notes`/`profiles`/`templates`
  rows are therefore **still in the store after upgrading; they are not
  deleted and not overwritten.** They simply have no screen pointing at them,
  because v2 ships no screen that reads them.
- `"seedContent": "initial-only"` is retained, so bumping `seedVersion` does
  **not** re-plant the new seed into an existing install (the standing
  "seed re-plants on bump" scar). An upgrading user keeps their store as-is.
- The v2 seed is a single empty agenda root — no demo tasks, no demo people,
  no personal information. Asserted structurally in
  `test/taskly_v2_test.dart` ("the seed is one empty agenda root and nothing
  else", "the seed carries no person-shaped content").

**Recommended user action, and the honest cost:** reset Taskly for a clean
start. This is the product owner's accepted decision for this rebuild. The
cost is real and is stated plainly in the app's own release note rather than
buried here: an existing user's v1 tasks and notes do not appear in v2. They
are recoverable from the store only by a deliberate act (the rows persist as
described above), not by anything the v2 UI does on its own.

**Not verified in this round:** whether the app's built-in data tools
(`appDataTools: true`) surface a table that no longer appears in the bundled
`tables.json`. The persistence of the rows is proven by the merge test above;
their *visibility* through the generic data browser is not, and this file does
not claim it.

### Engine-dictated column names (do not "tidy" these)

Two engine behaviors key off exact column-name literals, and both fail
**silently** if renamed:

- `toggleDone`'s recurrence (`flutterboard lib/src/functions/rows.dart`) shifts
  dates only for columns named `due`, `scheduledStart` or `endDate`. A column
  named `date` would copy forward UNSHIFTED — ticking a weekly task would
  spawn an endless run of same-day duplicates.
- The host's ICS-import menu item (`isan lib/src/app_screen.dart`,
  `_importIcsFile`) calls the engine's `importIcs` with only `{table, source}`
  — no column overrides — so imported events can only land in that function's
  defaults: `title`, `scheduledStart`, `endDate`, `notes`. It also picks its
  target table by sniffing for a `scheduledStart` column, falling back to the
  first table, which is why `entries` is declared first in `tables.json`.

Both are locked by tests: `test/taskly_recurring_test.dart` (asserts the next
occurrence lands a week later, and says in-file that renaming the column back
to `date` is exactly what it catches) and `test/taskly_v2_test.dart`
("the schema matches importIcs defaults, which take no overrides").

### Known limits of ICS import, recorded rather than hacked around

`importIcs` is shared engine code that takes no per-applet arguments, so an
imported row arrives with no `kind`, no `author`, no `source` stamp, and **no
`contains` edge back to the agenda root** — meaning imported events show on
Today and the Calendar but are NOT included in a share until the user opens
and re-saves them. This is asserted as current behavior (not aspiration) in
`test/taskly_v2_test.dart`, "imported events land on the agenda even with no
kind", and stated in plain language on the applet's own Settings screen.

### Tests covering this change

- `test/taskly_v2_test.dart` — share-eligibility of the table names (asserted
  literally, with the reason), the contains-edge on every add action,
  share/projectSettings targeting the root, seed cleanliness, screen
  reachability, the agenda's new engine props, the map, the geopick rule
  shape, and the ICS round trip.
- `test/taskly_recurring_test.dart` — recurrence against the REAL `ui.json`
  toggle args, and completion-stamp clearing.
- `test/applet_lint_all_test.dart` — taskly contributes zero lint warnings and
  zero errors (a `caption` translation map that would have crashed at runtime
  was caught here and fixed before landing).
- `test/nav_label_localized_test.dart`, `test/screen_title_localized_test.dart`
  — updated from the retired `tasks` nav/screen to `today`; assertions
  unchanged in kind.
