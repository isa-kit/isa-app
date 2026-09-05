# architecture — progress_units table removed (2026-09-05)

Breaking schema change, deliberately made — this marker acknowledges it
through the compat gate (tool/check_compat.sh).

- **What broke:** table `progress_units` (and its column set) was REMOVED
  entirely, not just left empty.
- **Why it's safe with no data migration:** `progress_units` had been
  written ALWAYS EMPTY since archscrub-0903 (2026-09-03) — the live fleet
  codev-board mirror was cut for public-safety reasons before this repo's
  public flip, and the generator (`_claude/scripts/progress_mirror.py`)
  has appended zero rows to it ever since. No installed client — dev or
  prod — has ever had real data in this table to orphan. pubfix-0904
  (public-safety verification archverify-pub-0904) found the *empty*
  table's column set still publicly disclosed the shape of the private
  codev board (a `lane` enum of `awaiting-user/running/blocked/done`,
  `sessionTag`, `nextGate`, `trailText` fields) — public seed JSON that
  ships to devisant.com. Removing the table removes that disclosure.
- **UI impact:** none — the Progress/Now view (`ui.json`'s `progress`
  screen) reads `overview_summary` and `big_picture_flow`, never
  `progress_units`; verified by
  `test/architecture_big_picture_versions_applets_test.dart`.
- **Provenance:** pubfix-0904 session, from archverify-pub-0904's T3
  verdict (ok=FALSE) on the public architecture applet.
