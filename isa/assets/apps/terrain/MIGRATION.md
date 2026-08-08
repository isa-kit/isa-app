# terrain (Models) — schema migrations

## 2026-07-19 r12 — Flow stage authoring + wiring-honesty corrections (units D+E, additive)

seedVersion `2026-07-19.2-flow-wiring-honesty`. From
`_claude/projects/model-canvas-detail-presentation-spec.md` sections D+E: the
model card's target end-state is Map · Flow ONLY (listing tabs removed), a
staged L-to-R `flowcanvas` node, and honest wiring text. **This round ships
the schema + content half (D1/D2 + all of E); the UI half (D3, retargeting
the model card to `flowcanvas` with the listing tabs removed) is a STOP —
see gap note below.**

**Schema (columns.json, additive):** `model_steps` gains `stage` (text,
lexical-sort = L-to-R flow order), `lane` (text, row grouping — defaults to
the step's existing `role`), `flow_order` (number, intra-stage order).
`data_inputs` gains `stage` (text), `intent` (enum:
source|calibration|validation|context|future), `feeds_step` (ref ->
model_steps, optional).

**Content — stage authoring:** every model_steps row across all 13 models
now has `stage`/`lane`/`flow_order`, computed from each model's own
step_links DAG (Kahn longest-path generation, calibration-loop edges
excluded from the rank calc since they intentionally loop back). Every
model has at least one Beginning-stage (`*-begin`) and one Ending-stage
(`*-end`) step with a connected path between them — verified by a
data-driven test, not a hardcoded model list (`test/terrain_flow_wiring_test.dart`).
Models that had no in/out anchor pair (m_cb, m_snd — single-step models)
got a new Beginning step (`cb_in`, `snd_in`) grounded in their real
data_inputs rows. Every data_inputs row got `stage`+`intent`, and where a
real consumer exists, `feeds_step`.

**E — wiring-honesty corrections** (re-verified against
`tool/korea/build_korea.py` row by row, not blind-applied):
1. `tt_times.method` `mt_raptor` (false — code is
   `nx.single_source_dijkstra_path_length`) -> new honest method
   `mt_dijkstra`; math/why/cons/alternatives rewritten to match.
2. `cn_gtfs` claimed 3 gov sources (data.go.kr TAGO / Seoul Open Data /
   GTFS mirror) -> corrected to the ONE real source, OSM Overpass
   (`overpass()`'s two endpoints, `rel[route=subway]`). Same false-source
   text on the `m_centrality` model row itself was also corrected (not
   separately itemized in the brief, but directly contradicted E2 if left).
3. `tt_net`/`tt_net_in`/`tt_net_transit`/`tt_net_street`/`tt_net_out`/
   `tt_surface` stripped of GTFS-ingestion, time-expanded-graph,
   street-network-routing, and surface-interpolation claims —
   `build_korea.py` builds ONE flat-speed OSM subway graph and buckets
   arrival minutes into fixed bands, nothing else. `tt_net_transit`
   relabeled "Build route-hop edges"; `tt_net_street` relabeled "Keep
   largest connected component" (grounded in the real
   `G.subgraph(max(nx.connected_components(G),...))` line); `tt_surface`
   relabeled "Band arrival times" (grounded in the real fixed-threshold
   `band_of()`). `m_ttmap`'s own model-row description/cal_method/sources/
   standard/primary_method/data_in rewritten to match.
4. `m_kraccess.primary_method` `mt_ttsurface` (false — no surface-interpolation
   step exists here) -> `mt_dijkstra`; the model had REAL reach45 code but
   ZERO steps — seeded `kr_in -> kr_dijkstra -> kr_band -> kr_out`, matching
   `reach45_by`/`reach_bands_for` exactly.
5. Orphans: `s_engine` (zero links) set as `parent` (container) of `s1..s4`,
   matching its own description ("the four subprocess steps run in
   sequence"). `lu_vision` (already honestly "vision — inputs = gap") got an
   Ending anchor (`lu_vision_end`) so `m_luti` reads Beginning->Ending.
   `s_router1` (m_llmrouter's single step, "declared policy... not a
   computed/fitted model") got `s_router0`/`s_router2` Beginning/Ending
   anchors, all three carrying explicit declared/not-computed language.
6. Dangling layers: re-verified all 6 flagged rows — 4 already had an
   honest `status`+`note` (`ml_4s_hf_trans` selectable/"declared, provider
   not yet reachable"; `ml_wb_dasy`/`ml_wb_pycno`/`ml_4s_hf_embed`
   planned/noted) and needed no change. Only `ml_wb_sae` and `ml_wb_split`
   had `status: planned` with an EMPTY note — filled both.
7. Unconsumed data_inputs: `di_pums` (no m_forecast step actually consumes
   PUMS microdata) -> `intent: future`, no feeds_step. `di_worldgtfs` ->
   `feeds_step: r_gtfs`. `di_kr_osm_reach` -> `feeds_step: kr_in` (the new
   m_kraccess chain). Two more same-pattern rows found while re-verifying
   (`di_kr_transit`, `di_tt_gtfs`) were already honestly `status: key-gated`
   -> marked `intent: future` (no text change needed, already accurate).

**GAP — Unit D3 (UI) STOPPED, not shipped:** re-verified against fb-dev
`d066712` (the pin this worktree's `pubspec_overrides.yaml` targets — left
untouched per brief). `canvas`/`flowcanvas` has NO per-instance row-filter
prop (`grep filter lib/src/canvas/canvas_view.dart` = zero hits; PropSpec
list confirmed no `filter`/`scopeColumn`/equivalent), and reads nodes via
plain `board.visibleRows(nodesTable)` — unlike `cards`/`bubl`, which both
implement their own `_applyFilter` + `resolveFilterToken` and are how
today's Diagram/Components/Layers/Data tabs correctly scope to
`$selected:models`. The one candidate workaround, the global `setFilter`
board action (which DOES reach `visibleRows`), is not a per-screen scoped
mechanism — the engine has no screen `onEnter`/`onExit` lifecycle hook to
fire it automatically on navigation and clear it on leaving, so it would
either require a manual "filter to this model" tap (not real scoping) or
leak state across models/screens. Per the brief's explicit instruction,
this is a genuine engine gap, not a JSON authoring gap — **STOPPED rather
than shipping an all-models-soup Flow tab**. `ui.json` is UNTOUCHED this
round: the existing Map/Diagram/Summary/Components/Layers/Data tabs stay,
Diagram still renders via `bubl` (which DOES scope correctly). Recommend a
follow-up fb-dev engine unit adding a `filter`/`scopeColumn` prop to
`canvas`/`flowcanvas` (mirroring `cards`/`bubl`'s pattern) before Unit D3
can land.

## 2026-07-18 r11 — Seoul connectivity/routes round 1, phase 1 (additive)

seedVersion `2026-07-18.4-seoul-connectivity`. Two asks, no origin needed for
either: (a) an OVERALL-CONNECTIVITY heatmap (how well-connected each
district/station is, no origin picked) and (b) ROUTE LINES drawn on the map
(the full subway network + each hub's shortest-path tree). Phase 2
(multi-pin/any-point navigation, walking) is NOT built this round.

Data (additive, `tool/korea/build_connectivity_routes.py`): new
`kr_district_conn` table (25 rows — mean minutes from each district
to every OTHER district, derived from the already-shipped `kr_district_od`;
rank + a tercile tier well-connected/mid/peripheral); `kr_stations` gains
`conn_score` (0-100, linear map of the already-baked `closeness` column) +
`conn_tier` (quintile, very-low..very-high). New GeoJSON assets
`apps/terrain/network.geojson` (587 LineString features, the full
station-to-station link graph, colored by recognized Seoul Metro line where
available else a neutral gray) and `apps/terrain/hub_trees.geojson` (2,350
LineString features — each of the 5 hubs' Dijkstra shortest-path tree,
~470 edges apiece, tagged `origin` with the SAME district-gu id the existing
hub buttons already `setFilter` `kr_district_od.o` to).

Engine (flutterboard dev `f6f0efd`, additive `map` node props, see
node_schema.dart PropSpecs): `linesAsset`/`linesFilterProperty` draws a
GeoJSON LineString/MultiLineString overlay filtered by the node's existing
`featureFilterColumn` selection (nothing draws until selected — the hub
route tree); `linesAsset2`/`linesFilterProperty2`/`lineColor2`/`lineWidth2`
is a SECOND, independent line layer (the always-on network, since one
filter can't apply to only some features in one asset); `linesToggle` shows
a chip that hides/shows `linesAsset2` only (layer 1's own filter already
gates its visibility).

UI (`apps/terrain/ui.json`, both `outputs_ttmap` copies — the standalone
screen and the model-card Map-tab switch case — byte-consistent on the map
node props): `outputs_ttmap` is now a `segments` MODE TOGGLE — "From an
origin" (the existing heatmap-0713b behavior, unchanged, plus the new
`linesAsset`/`linesAsset2` route props) and "Overall connectivity" (a new
map: districts shade by `kr_district_conn.mean_m`, station pins
color by `conn_tier`, no `featureFilterColumn` since there's no origin to
re-select, ranked-by-connectivity cards, an honest caption that the hub
quick-select buttons don't apply here). Existing installs: additive columns
+ 2 new tables/assets + ui-only mode-toggle restructure; no heal needed
(nothing removed, `kr_stations`/`kr_district_od`/hub-button wiring
untouched).

## 2026-07-14 r10 — router case joins the model-card switch (additive)

seedVersion `2026-07-18.3-model-switch-complete`. The shared model card's Map
tab `switch` (on `models.outputs_screen`) had no `outputs_router` case, so the
Auto-router model fell to the generic "no baked map" empty state despite having
a real baked output (the routing-tiers ladder). New case renders an honest
"policy ladder, not a map" eyebrow + the `routing_tiers` cards (bounded 360).
Every outputs_screen value now has an explicit case or the honest default.
Existing installs: ui-only + seedVersion bump; no schema change.

## 2026-07-12 r8 — map moves OFF home INTO the model card (per-model, additive)

seedVersion `2026-07-12.9-model-card-map`. User correction: the embedded
geolabs Databoard map did not belong on the Models home/overview; the map
should live INSIDE a model card, showing that model's outputs. (1) REMOVED the
geolabs `embed` node from `screens.overview` — home is back to the model
registry + header buttons only. (2) The model detail gains an `Output` tab in
its `segments` switcher (Diagram · Output · Summary · Components · Layers ·
Data). Per-model correctness without a conditional-visibility engine primitive:
NEW additive `models.detail_screen` column routes each model on tap
(`overview` cards action uses `goto` `screenColumn:detail_screen`) — the two
Seoul models with real baked maps (`m_centrality`→`model_centrality`,
`m_ttmap`→`model_ttmap`) get their own full model-card screens whose Output tab
renders the `kr_stations` map; the other 10 models fall through to the shared
`model` screen whose Output tab shows an honest empty state ("Outputs are
server-gated — no baked map ships for this model yet"). No Seoul data leaks
onto non-Seoul models (test-guarded). FOLLOW-UP (future): a general
`showIf`/`visibleWhen` node primitive keyed to `$selected:` would collapse the
two duplicated per-model screens back into one shared screen; multi-model
map overlay is a separate future feature. Existing installs: additive column +
new screens on the seedVersion bump; no destructive step.

## 2026-07-12 — provenance/freshness JSON adoption (arch-0712 unit 7, no seedVersion bump)

`ui.json`-only + `tables.json`-only change, no `content.json` seeded-row or
column changes, so `seedVersion` stays at `2026-07-12.6-model-router` (no
schema-merge is needed — ui.json is read fresh on every load, not gated by
seedVersion). Two additions:

1. `apps/terrain/tables.json` — the `runs` and `endpoint_info` table
   definitions each gained a label-only `"source": {"type": "httpAction"}`
   key documenting that they are targets of the Runs screen's existing
   `http` actions (the four-step `/model/scenario` calls and the `/model/
   health` check). This is a passive audit annotation, not new UI or a new
   fetch — the engine does not read this key (the runtime provenance
   envelope populated by `mergeProvenance` in `board_state.dart` is separate
   and only ever written by an actual `http`/`importCsv` call landing rows).
2. `apps/terrain/ui.json` — the About screen gained a static "Seed vintage"
   caption: "Seoul seed built 2026-07-12 — kr_stations (471 OSM subway
   stations) via tool/korea/build_korea.py, per apps/terrain/VINTAGE.json."
   The `2026-07-12` date is copied verbatim, at author time, from
   `apps/terrain/VINTAGE.json`'s `kr_stations.fetched_at` field. This is an
   honest static copy, not a live-bound `format:"relative"` column read —
   the engine has no clean way to bind a bundled JSON sidecar file (as
   opposed to a table column) into a text node's value, so the caption will
   go stale silently if `VINTAGE.json` is refreshed without a matching edit
   here. A future rebuild of the Korea dataset (`tool/korea/build_korea.py`)
   MUST update both `VINTAGE.json.kr_stations.fetched_at` and this caption
   together.

## 2026-07-12 r4 — provider registry + per-model provider selection (additive)

seedVersion `2026-07-12.4-providers`. New table `providers` (id, name, kind
enum device|forge-julia|forge-ollama|hf-hosted|browser, summary, status enum
live|held|planned default planned, notes) — 5 seeded rows describing WHERE
each model actually runs: `pv_device` (on-device Dart, live), `pv_forge_julia`
(the transit4 Julia service behind the edge proxy, live, but the edge route
is still token-locked 403 — noted honestly), `pv_forge_ollama` (server-side
Ollama LLM worker, HELD by user decision), `pv_hf` (HuggingFace-hosted,
planned — documentation-only), `pv_browser` (in-browser/web build, live).
SECURITY POSTURE: these rows are labels + documentation only — no
endpoints, URLs, tokens, or keys; the applet's one endpoint reference stays
in `app.json` meta, unchanged. New nullable enum column `models.provider_id`
(options = exactly the 5 provider ids, no default — an absent value means
"see the existing free-text `provider` column"); the pre-existing
`models.provider` text column is untouched (additive only, no retype).
Every existing `models` row got `provider_id` set from an honest read of its
current `provider` text: explicit forge/Julia mentions -> `pv_forge_julia`
(m_4step, m_cb, m_snd); explicit Ollama mentions -> `pv_forge_ollama`
(m_wellbeing, m_translator); everything else (generic "server pipeline",
"planned — server", or local/reproducible scripts) -> `pv_device`, the
conservative default when the text didn't name a specific server (m_found,
m_luti, m_forecast, m_router, m_centrality, m_ttmap). Registries (catalog)
screen gets a new "Providers" segment (cards, mirrors the Stacks segment's
shape: title/subtitle/status+kind tags/expandSingle/expandChevron/
expandFields kind+notes/editRow) — catalog segment count 8 -> 9. Model
screen's Summary pane record fields gain `provider_id` right after
`provider`. Existing installs: LWW seed heal adds the `providers` table +
rows and the `provider_id` values on the bump; no schema change to existing
columns.

## 2026-07-12 r3 — per-model diagram framing + actions on the fill body (additive)

seedVersion `2026-07-12.3-diagram-frames`. Click-through polish of r1, found by
the standing real-build verification. (1) POSITIONS REBASED: `model_steps.pos`
was laid out for the retired whole-fleet Pipeline canvas, so each model's
scoped Diagram opened mostly off-viewport (negative x). Every model's outer
chain is rebased to start near the origin (left-to-right from ~60,80), and
each parent step's child cluster is rebased the same way for the step_detail
sub-diagram. Pure data heal — ids/links/labels untouched. (2) ACTIONS MOVED
INSIDE THE PANE: a screen `header` never renders above a fill body, so a
first pass put Edit model / Scenarios & runs / View output on map in a
button row above the fill segments switcher — that render fixed the drop,
but real-web-runtime click-through testing found the row never received
pointer events (hover/press painted, onTap never fired; confirmed via both
trusted coordinate clicks and semantics DOM clicks, three independent
passes), while content INSIDE the segments panes (bubl bubbles, segment
tabs, card/record row taps) reliably did. Rather than ship dead buttons,
the actions moved one level deeper: each screen's first pane now opens
with the button row above its content — model's Diagram pane is
`column[ row(Edit model, Scenarios & runs, View output on map), bubl ]`,
step_detail's Inside pane is `column[ row(Edit step), text, bubl, text ]`.
The chrome fill-column shape is unchanged (`column[ segments(fill) ]`, no
header); only where the buttons sit relative to the tab bar changed.
Existing installs: LWW seed heal updates un-edited `pos` fields on the
bump; no schema change.

## 2026-07-12 r2 — HuggingFace models as selectable methods (additive)

seedVersion `2026-07-12.2-hf-options` (renumbered from the handoff spec's
suggested `2026-07-12.1-hf-options` — that slot was taken by the r1
model-diagram round landing first; bumped to `.2` here). Two nullable columns
on `methods`: `intent` (enum translate|embed|classify|stt|chat|none, default
none — `none` = pure math, every existing row unchanged) and `hf_repo` (text
provenance repo id, never an endpoint/key). SEED: two new `methods` rows
(`mt_hf_opusmt` opus-mt translation, `mt_hf_embed` sentence-transformers
embeddings — `approach` intentionally empty, they are models not formulas)
and two new `model_layers` rows attaching them to `m_4step`
(`ml_4s_hf_trans` status `selectable`, `ml_4s_hf_embed` status `planned`,
both `stage:pre`) — reusing the exact calibration-solver pattern
(`ml_4s_cal_*`) already shipped. `intent`/`hf_repo` also added to the
Registries → Methods cards' `expandFields` so the repo id is visible; no
other UI change, no new tables, no engine change. HF options are
documentation-only in this round — inert until Phase 2-forge (server-side
inference) lands; see `_claude/projects/model-subcomponents-hf-selectable-spec.md`.
Existing installs: additive LWW seed heal only; no destructive step.

## 2026-07-12 r1 — model view = the diagram; drill; Pipeline retired (additive)

seedVersion `2026-07-12.1-model-diagram` (merges two sibling rounds: this and
the unshipped `2026-07-10.3-model-flow` branch — one combined landing).
(1) TAP-TO-OPEN: the Models registry cards set `expandable:false`, so a tap
fires the existing selectRow→goto chain directly (long-press keeps
Open/Edit/Delete). (2) MODEL VIEW RESHAPED: the model screen body is a
fill `segments` switcher — Diagram · Summary · Components · Layers · Data.
Diagram is the model's own flow (bubl scoped via the NEW engine `filter` prop
`{column: model_id, value: $selected:models}`; `showNested:false` tucks
sub-steps behind a +N badge on their parent). (3) FRACTAL DRILL: tapping a
process in the diagram selectRow→goto's the NEW off-nav `step_detail` screen —
"Inside" is a second bubl scoped `{column: parent, value:
$selected:model_steps}` showing that step's internal input → processing →
output chain; "This step" is the step's full record. SEED: `tt_net` (m_ttmap)
and `cn_graph` (m_centrality) gain 4 child steps + 3 internal links each
(model_steps 42→50, step_links 36→42) so the Korea models drill for real,
matching the existing `p_interm` pattern. (4) OUTPUT ACCESS: the model header
gains "View output on map" → Outputs. (5) PIPELINE TAB RETIRED: the global
Pipeline nav tab + screen are removed — the unfiltered whole-fleet bubl was
the bug the scoped Diagram replaces; its genuinely-global "Inputs" and
"Stacks" cards move into Registries as two new segments. nav is now
overview · runs · outputs · catalog · about. Existing installs: additive
LWW seed heal only (new rows seed in; saved rows win); no destructive step.

## 2026-07-10 r2 — flow navigation + pre/post stages + provider seam (additive)

seedVersion `2026-07-10.2-flow-nav`. Three additive moves. (1) STAGE: NEW
`model_layers.stage` enum pre|core|post (default core) — attached functions
declare whether they run before the chain, inside it, or after; the model
view's layers block now groups pre → core → post (status stays as the colored
tag + teal selectable accent); all 16 seeded layers stamped. (2) NAVIGABLE
FLOW: the Pipeline bubl gains `onLinkTap: editRow` (NEW engine prop,
kEngineBuild bubl-link-tap.1 — tapping a drawn arrow opens that data-flow
row), `pinchZoom`, `holdMenu`, `zoomable` — the diagram is now the navigation
surface (tap a process = its full row incl. math; tap an arrow = what flows;
pinch/hold-ring to move around). Catalog gains an "Algorithm layers" segment
with an "Attach a function to a model" addRow button (the tray: pick model,
registry method, stage). (3) PROVIDER SEAM (llmlayer-0710 coordination): NEW
`models.provider` text ("Runs on — server / provider", shown on the model
record) seeded on all 9 models — LABELS ONLY; endpoints/keys stay out of
applet JSON (data-not-code), so LLM/server-backed models later ride the same
record shape without a migration. Existing installs: new column/fields arrive
on the bump (LWW seeds fields that have never been edited).

## 2026-07-09 r2 — algorithm layers: methods become composable per model (additive)

seedVersion `2026-07-09.2-model-layers`. NEW join table `model_layers` (one row
per algorithm working inside a model: model_id × method_id refs + layer /
algorithm display text + role + status active·selectable·planned) — entering a
model now lists its algorithms as layer rows you can add/swap/remove; the
calibration solver trio from `.1-calib-select` appears as the selectable case
(teal accent). Methods registry += the six core algorithms (`mt_crosswalk`,
`mt_crossclass`, `mt_gravity`, `mt_logit`, `mt_assign`, `mt_bca`), each with
purpose/when-use/approach/cons/must-document + package. NEW `models.uses_model`
column ("Model used (builds on)" — curated text, seeded on all 7 models); the
model drill-in record gains uses_model + data_in + data_out. Wellbeing's six
planned method-layers are seeded honestly as `planned` (the model itself is
planned). Existing installs: new table/column/rows arrive on the bump; no
reseeded fields on existing rows (nothing to heal — uses_model is a NEW field,
which LWW seeds cleanly onto existing model rows).

## 2026-07-09 — calibration solver selectable per run (additive)

seedVersion `2026-07-09.1-calib-select`. The calibration ALGORITHM becomes an
interchangeable, selectable module (user direction): NEW `run_config.calib_method`
enum (bisection · IPF · Bayesian optimization, default bisection) + NEW
`runs.calib_method` (`first:run_config.calib_method` — the selection freezes onto
every run snapshot like β/tier/zone do). NEW methods rows `mt_ipf`
(IPF/Furness — table balancing to margins) + `mt_bayesopt` (multi-parameter
search) join `mt_bisect`, each with its must-document clause + a new additive
`methods.package` column naming where it runs (Julia server packages vs the
~30-line device function). NEW `model_steps.s_calib` swappable component +
`step_links.l_calsel` calibration arrow surface the solver on the m_4step
module list and pipeline. Seeded runs stamp `calib_method` ONLY where the
cited source documents the calibration (beta present) — 5 rows stay honestly
empty. Existing installs: new rows/columns arrive on the bump; m_4step's
updated `calibration`/`cal_method` prose heals via `migrateTerrainCockpitSeeds`
(heal-table entries added). Compute stays server-side: selecting IPF/Bayes-opt
documents intent today; the live solver swap goes real when /model unlocks
(same honest-dormant contract as ▶ Run scenario).

## 2026-07-06 — model cockpit: runs return as the COCKPIT LEDGER (additive)

seedVersion `2026-07-06.1-cockpit`. Terrain regains a lightweight run surface —
three NEW tables `run_config` (single setup row `cfg`), `runs` (append-only
ledger whose `first:run_config.*` column defaults freeze the model-attribute +
scenario-config snapshot onto every recorded launch), `endpoint_info` (health
probe target) — plus five additive `models` columns (runnable, primary_method,
cal_method, calibration, sources).

**Suite roles (declared canonicity, no takeback of the 2026-07-04 split):**
terrain's `runs` is the *cockpit ledger* — launches recorded in-app plus 13
curated snapshots of real transit4 run reports (each row's `status` cites its
source file). The **scenarios** applet remains the *deep-provenance archive*
(run_inputs / run_checks joins, model_history); Atlas maps outputs; Model
reports charts them. The two run tables live in different stores and never
sync to each other; the cockpit's "Scenarios" button is the bridge.

**Upgrade path (existing installs, dev-channel only):** new tables and new
columns arrive on seedVersion bump; RESEEDED FIELDS ON EXISTING ROWS DO NOT
(content merge is LWW with saved rows winning ties — protects user edits by
design). Concretely, an install that already has terrain keeps m_4step's old
`model_version` "7fa3c41" summary/coverage prose and the `ci_coverage` cities
row until the user opts into applet menu → "Reset from file" (destructive) —
fresh installs seed the corrected values (m_4step `fee6a0b`, folded coverage,
no ci_coverage row). Nothing breaks either way; the stale prose is cosmetic
and documented here rather than silently overwritten.

## 2026-07-04 — suite split: terrain → Models; spine + outputs moved out

The urban-models suite split into four distinct applets (user direction).
Tables REMOVED from terrain's definition and re-homed:

- → **apps/scenarios** (new applet, store `isan_scenarios`): runs, run_config,
  run_inputs, run_checks, soundness_checks, confidence_tiers, model_history,
  datasets, standards — the run + proof spine stays joined in ONE store.
- → **apps/atlas**: results, zone_stats, slices, shapes (+ towns.geojson) —
  the map dashboard's outputs and painted layers.
- RETIRED (no new home): layers (terrain's copy; atlas keeps its own), panels,
  layer_stats — display registries superseded by the split.

Terrain keeps the logic/registry tables only: models, cities, model_steps,
step_links, zone_systems, modes, metric_families, wellbeing_factors, methods.

Data impact: dev-channel only (terrain never shipped to prod). Old rows for
removed tables remain untouched in existing stores (definitions dropped, data
not deleted); the new applets seed their own copies (seedVersions
2026-07-04.10-split / .10-dashboard / scenarios .1-init). No convert-on-read
needed — the seeds ARE the canonical fixture data for these applets today.

## 2026-07-09.2-model-inputs (t4inputs-0709)
Additive seed tables only — no heal needed (LWW keeps user rows; these tables
are new): `data_inputs` (geofenced input registry: source · where-it-applies ·
granularity · vintage · status · script · stitch, per model) and `model_stacks`
(named compositions with documented seams). `models` gains `data_status`
(inputs-satisfied line) + two new rows (m_forecast — back-cast skill on the
card; m_router — exact routing, honesty correction stated). `model_steps` gains
per-model lanes (forecast/router/wellbeing/translator/land-use) + `stack`-kind
links; pipeline screen = header model picker (setFilter) + Flow | Inputs |
Stacks segments (fill). Drill-in gains a per-model inputs block.

## 2026-07-10.1-model-view (t4mview-0710)
LIST -> MODEL VIEW restructure (engine select-row.1 required). Models tab is
now a card LIST; tapping chains the new `selectRow` + `goto` to the dedicated
`model` screen, where record/components/layers/inputs all bind via the
`$selected:models` token. Additive schema: `model_steps` gains `role`
(source/preprocess/engine/math/subprocess/postprocess/output) + `math`
(the mathematical logic, real formulas); `data_inputs` gains `shape` /
`extent` / `regions` (REAL previews computed from the server data);
+`s_engine` row (the Julia four-step engine component). No heal needed:
new columns + new row only; existing row values untouched.

## 2026-07-19.3-model-flow-card
model card = Map · Flow; Diagram/Summary/Components/Layers/Data listing tabs
removed from the model screen (their content now lives as flowcanvas
node-tap + data-overlay interactions); the flowcanvas engine gap noted in
2026-07-19.2 is resolved (fb-dev 6d3ca69 filter/dataFilter prop) so the Flow
tab renders a scoped, editable flow: model_steps nodes (stage/lane/flow_order
authored), step_links edges, data_inputs overlay (stage/intent/feeds_step),
palette for adding steps. step_detail screen removed (was reachable only
from the removed Diagram tap-chain). Additive-only, no data migration
needed — same seed rows, only ui.json/app.json/MIGRATION.md changed.
