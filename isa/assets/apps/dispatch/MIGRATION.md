# dispatch — unified-entries rebuild (2026-07-01)

Breaking schema change, deliberately made and migrated — this marker
acknowledges it through the compat gate (tool/check_compat.sh).

- **What broke:** tables `nodes`, `updates`, `attachments` were REMOVED,
  replaced by the unified `entries` table + a `relations` (edges) table
  (the dispatch clean-rebuild: one node model, type-set-once, graph slices).
- **The migration:** `lib/src/dispatch_migration.dart` — a one-time,
  id-preserving migration of the legacy model into unified `entries`,
  run on first open of the rebuilt applet.
- **Proof:** `test/dispatch_migration_test.dart` (2 tests, green in the
  suite) + the rebuilt applet's own tests.
- **Provenance:** built on the `develop` integration branch (dispatch-0630
  session, per the dispatch clean-rebuild spec), merged to `dev` 2026-07-01
  when `develop` was retired.
