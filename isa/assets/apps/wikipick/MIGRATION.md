# wikipick (Wikipick) — schema migrations

## 2026-09-03.readerfind — bookreader find-in-article parity restored (no schema change)

No seedVersion bump: purely a reader-chrome/engine-prop change — `columns.json`/
`tables.json` untouched, `content.json` untouched (`tool/check_compat.sh` needs
no acknowledgement).

**What shipped**: closes the disclosed gap logged in both the
`2026-08-31.pictureb1` and `2026-08-31.pictureb2` entries below — flutterboard
gained `findEnabledSetting` on `bookreader` (wikifind-0903, same prop name/
contract notepad's find used before the reskinwikipick-0825 migration
dropped it), so the reader node here now reads `wikiReaderFindOpen`, and the
tap-summoned action footer's 4th icon is a real find/close-find pair (`search`/
`search_off`) instead of the reused Reading-options `tune` glyph noted below.
`composeResolveIcon` (flutterboard's `button.icon` resolver) also gained the
`search`/`search_off` mappings — neither existed before, so either name would
have silently fallen through to the generic `Icons.touch_app` placeholder.

## 2026-09-03.topicthresh — relative CORE threshold, replaces the absolute-majority rule (additive only)

seedVersion bumped `2026-09-02.topiccapture` -> `2026-09-03.topicthresh` (one
new column, `topicCaptureStatus.emptyCore`, boolean, default `false` — the
`integrate.sh` schema guard requires a bump on any schema diff); pre-existing
rows read the default and are unaffected (this table is transient scratch,
cleared on every capture run anyway). `content.json` stays `{}`, no seed
re-plant needed.

**What changed and why**: live-verifying `2026-09-02.topiccapture` against
real Wikipedia (task chip `task_53a9f043`, logged in
`_claude/projects/wikipick-v1-spec.md` W15) found the approved CORE rule —
linked by an ABSOLUTE majority of the other 11 candidates
(`linkedByCount*2 > otherCount`) — produces an EMPTY core for a real "rome"
search: 7 of the top-12 same-language results are unrelated same-name
people (footballers etc.) who can never interlink with the Rome/Roman
Empire cluster, so no candidate can ever clear a majority bar denominated
against all 11 others. The user's intent (capture the Rome cluster,
exclude the unrelated same-name results) was unambiguous; the absolute
threshold was the defect, not the derivation (the underlying
`prop=links`-based centrality tally and its pagination fix are unchanged).

**The new rule** (`_isCoreCandidate` / `_coreThreshold` in
`lib/src/wikipick_net.dart`): score each candidate exactly as before
(number of OTHER candidates whose outbound links reach it); let `topScore`
be the HIGHEST score anywhere in this run's pool; CORE =
`score >= max(2, ceil(topScore / 2))`; PERIPHERAL = the rest. Scoring
RELATIVE to the pool's own best-connected candidate (rather than an
absolute bar tied to pool size) is what lets a genuinely interlinked
cluster surface as CORE even when it doesn't reach every other candidate —
on the "rome" fixture the cluster reaches each other (topScore 4 among a
5-member cluster) but never the 7 isolates, so `ceil(4/2)=2` correctly
includes the whole cluster and excludes every isolate. The floor of 2
(not 1) prevents the opposite failure: a single stray cross-link between
two otherwise-unrelated candidates must not manufacture a fake "core of
one". `topScore <= 1` (nothing in the pool is linked by 2+ others) is the
honest degenerate case — every candidate then fails the floor-2 threshold,
`coreCount` lands at 0, and this is not special-cased: it falls straight
out of the same formula (the top-scoring candidate, when `topScore >= 2`,
always satisfies `score == topScore >= threshold`, so `coreCount == 0` iff
`topScore <= 1`).

**New column**: `topicCaptureStatus.emptyCore` (boolean, default `false`) —
stamped `true` once analysis is done and `coreCount` is 0 (or the run
failed outright before any candidates were fetched). Computed host-side
because no aggregate-count `showIf` primitive exists in the engine (same
established pattern as `searchStatus.canCaptureTopic`). The `topicCapture`
screen now wraps the CORE eyebrow+list in a `showIf emptyCore==false`
container and adds a sibling `showIf emptyCore==true` container with an
honest "these results don't interlink — pick seeds by hand" banner; the
PERIPHERAL candidates list (`filter isCore==false`) is unconditional and
becomes the ONLY candidate list shown in the degenerate case, listing
every candidate unchecked for manual picking — never a fake CORE.

**What happens to existing data**: not lossy. `emptyCore` defaults to
`false` for any pre-existing `topicCaptureStatus` row (none persist across
app restarts in practice — this table is cleared on every new capture run
and again on CREATE), and every other column's meaning is unchanged; only
which candidates land in `isCore=true` for a NEW capture run can differ
from `2026-09-02.topiccapture`'s behavior (strictly a superset-or-equal of
what the old absolute-majority rule would mark core, never fewer, since the
new relative bar is provably no stricter — see the "top-scoring candidate is
always core" invariant above).

### Tests covering this change

- `test/wikipick_topic_capture_test.dart`: reworked the majority-boundary
  group into a threshold-boundary group (`debugCoreThreshold`/
  `debugIsCoreCandidate` — even/odd `topScore` rounding, the min-2 floor,
  the top-scorer-always-core invariant, the `topScore<=1` degenerate case);
  added the real-"rome"-shaped fixture (5 interlinked + 7 same-name
  isolates -> exactly the cluster is core, the exact shape that broke the
  old rule) and a fully-degenerate fixture (12 isolates, nothing links ->
  `emptyCore` true, everyone unchecked); reworked the ui.json structural
  test to walk the whole node tree (the CORE/PERIPHERAL lists now nest one
  level deeper inside `emptyCore`-conditioned wrapper columns) and added a
  new structural test pinning the `emptyCore==false`/`emptyCore==true`
  wrapper showIf conditions and the banner's EN/KO text. All prior tests in
  this file (full-run progress, rate-limited-candidate partial-run,
  checkbox toggle/estimate, CREATE dedup) re-verified green unchanged.

## 2026-09-02.topiccapture — "Capture as a topic" from search (additive only, no breaking schema change)

seedVersion bumped `2026-08-31.acceptfix` -> `2026-09-02.topiccapture` (the
`integrate.sh` schema guard requires a bump on ANY schema diff, not just a
breaking one) even though every change here is ADDITIVE (two new scratch
tables, three new columns on the existing `searchStatus` row, all with
declared defaults); `content.json` stays `{}` per the seed-content rule
(nothing to re-plant — see the seed-content-initial-only SCAR), and
`tool/check_compat.sh` passes without a MIGRATION acknowledgement (additive
changes pass that gate unconditionally on their own).

**What shipped** (user-approved TopicMode/TopicBuilder mockups): a search
returning 5+ results shows a "Capture '<Term>' as a topic" card
(`searchStatus.canCaptureTopic`, computed in `wikiSearch`). Tapping it opens
a new `topicCapture` screen that analyzes the top 12 same-language search
results' CENTRALITY: for each candidate, `action=query&prop=links`
(`pllimit=500`, `formatversion=2`) is fetched (paced by the existing
`_kInterFetchDelayMs`/`debugWikiThrottleMs` throttle and
`debugWikiCrawlBackoff` 429-retry infra `wikipick-crawl-throttle-0821`
already established — no new fetch-loop mechanics), and CORE = linked by a
MAJORITY of the other 11 candidates (pre-checked) vs PERIPHERAL = the rest
(unchecked). CREATE mints a real `seed_groups` row and joins every CHECKED
candidate via the EXACT existing save/dedup/join path
(`_commitSeedSave`/`_findArticle`/`_joinSeedToTopic`, the same ones
`wikiAddSeedToTopic` already uses) under the current `saveOptions`
depth/images choice — no parallel topic-creation structure.

**New tables**: `topicCandidates` (transient — one row per candidate,
cleared/replaced every capture run and again on CREATE) and
`topicCaptureStatus` (single-row `tc1` scratch: term, editable name,
live analyzed/total progress, core/peripheral counts, the honest-rough
"≈ N articles" estimate).

**New `searchStatus` columns**: `canCaptureTopic` (bool, default false —
the ONLY field the card's `showIf` reads; no aggregate-count `showIf`
primitive exists in the engine, so this is computed host-side),
`captureCardTitle` (the composed "Capture '<term>' as a topic" string, since
a `cards` title has no prefix/suffix templating for a raw value),
`captureCardHintKey`/`captureCardIcon` (fixed sentinels for the card's
static bilingual subtitle + leading icon via `cards`' `valueLabels`/
`iconColumn`).

**Disclosed deviations** (engine primitive gaps, same "note it, don't build
a whole new node type" discipline every prior wikipick round has used):
cards has no checkbox primitive (see the cards-menuActions-never-render
SCAR and W12's own multi-select deviation) — a filled/outline check ICON
(`iconColumn`, `checkIcon` column) driven by tap-the-row IS the checkbox
here, same convention. The mockup's PERIPHERAL dimming and the search
card's trailing chevron are not rendered (no generic opacity/leading-icon-
on-a-plain-`card` primitive exists — see `basic_render.dart`'s
`_buildNode_card`, which has no tap/action support at all, which is why the
capture card uses `cards` bound to a single `searchStatus` row instead of a
plain `card`); the PERIPHERAL section header text alone conveys the
distinction. Added `icons.dart`'s missing `check_box_outline_blank` case
(found via the icon-coverage guard while wiring the checkbox icon).

### Tests covering this change

`test/wikipick_topic_capture_test.dart`: pure centrality-derivation tests
over a synthetic link matrix (majority-threshold boundaries including the
exact-half non-majority case, zero-linked, all-linked, canonical-title
normalization incl. underscore/case folding); the 4-vs-5-result card-
visibility boundary; a full synthetic-Wikipedia run (MockClient, no real
network) asserting CORE/PERIPHERAL assignment and live progress fields,
plus a variant where one candidate's fetch is rate-limited past every retry
and the run still reaches `done` with the others analyzed (never a silent
stall); the checkbox-toggle live estimate recompute; CREATE reusing the
dedup path against a pre-cached article and skipping unchecked candidates;
and a structural ui.json walk confirming the card's `showIf` and the CORE/
PERIPHERAL lists' table/action wiring.

## 2026-09-02.topicsplitbar — real proportion bars on the Topic screen (additive only, no schema change)

seedVersion unchanged (`2026-08-31.acceptfix`) — no columns added/removed/
retyped; only `apps/wikipick/ui.json` (rendering) changed, `content.json`
untouched, `tool/check_compat.sh` needs no acknowledgement.

**Engine addition** (flutterboard, landed dev, promoted main, kEngineBuild
`+splitbar-standalone-node-0901.1`): a new standalone `splitbar` node — the
non-list, single-row twin of `cards`' per-row `splitBar` prop (both share
one visual, `buildSplitBarVisual` in chart_render.dart). Bound to exactly
ONE row via the same `table`+`filter`+`scopeRowId` resolution `stat` uses
(or a direct `rowId` token when the caller already knows the row), it
renders the identical slim two-segment bar (accent=part, muted=remainder)
plus a "part/total[ label]" digit pair. `height` (default 4) lets a caller
vary the bar's thickness — the Topic screen uses 8 for its topic-level
summary bar and 5 for the per-layer breakout rows, matching Topic.dc.html.

**What shipped**: resolves the `2026-08-31.pictureb2` entry's disclosed
deviation #2 (below) — the Topic screen's topic-level SYNERGY bar and its
Layer 1 / Layer 2 breakout rows now render a real `splitbar` (bound to the
selected `seed_groups` row's `topic_stats` scope, same `scopeRowId:
"$selected:seed_groups"` every other Topic-screen tile already used) instead
of digits-only `stat` rows. The descriptive count rows stay alongside each
bar unchanged — only the numbers-only rows that stood in for a visual bar
were replaced.

### What happens to existing data

Nothing — rendering-only change, no schema/content touched.

### Tests covering this change

- `flutterboard/flutterboard` `test/splitbar_node_test.dart` (new, 6 cases):
  render + part/total/label, custom `height`, total==0 draws nothing,
  unresolved `$selected:` token draws nothing, nonexistent `rowId` draws
  nothing, and `filter`-only narrowing (no `rowId`) picks the first
  surviving row — the same source `stat` uses.
- `flutterboard/flutterboard` `test/cards_splitbar_test.dart` (pre-existing,
  unmodified) still green — confirms the shared-visual extraction changed
  nothing about cards' own per-row `splitBar` rendering.

## 2026-08-31.acceptfix — two acceptance-traced fixes from the wikiacc-0831 verdict (additive only)

seedVersion `2026-08-31.pictureb2` -> `2026-08-31.acceptfix` — additive only
(1 new column: `searchStatus.librarySizeLabel`), nothing removed/retyped;
`tool/check_compat.sh` needs no acknowledgement; `content.json` untouched.

**What shipped**:
- **SearchResults missing snippet** — `apps/wikipick/ui.json` searchResults
  `cards` node now sets `"subtitle": "snippet"` (the `snippet` column already
  existed on `searchResults`, `columns.json` line 85; the `cards` node type
  already exposes `subtitle`, `node_schema.dart` line 1108 — a one-line
  binding, no engine change). Search results now show a muted description
  under each title, per `SearchResults.dc.html`.
- **Byte-format nit ("1.4M B saved" -> "1.4 MB saved")** — root cause: three
  `stat` nodes (Preferences "saved size", Library dense "of 20 MB", Saving
  offline dense "saved") summed raw `articles.totalBytes` with
  `format:"compact"` (generic base-1000 K/M/B/T abbreviation) + `unit:"B"`
  appended separately — broken for ANY total >=1000 bytes, since compact's
  own scale letter collides with the literal "B" unit (e.g. "45.2K B",
  "1.4M B") instead of combining into "KB"/"MB". Fix: `searchStatus` gains a
  new `librarySizeLabel` text column (default `"0 B"`), recomputed in
  `_refreshLibraryCount` (lib/src/wikipick_net.dart) alongside the existing
  `libraryCount`, using the same `_formatSize` byte-tiering already used by
  `articles.sizeLabel`/`topic_stats.sizeLabel`. The three `stat` nodes now
  read it via `raw:true` + `scopeRowId:"s1"` (same pattern the Topic header's
  `sizeLabel` stat already used) instead of a live engine-side sum, so the
  same one correctly-formatted string ("1.4 MB") backs all three displays.
  Topic header was already correct (already used `raw:true` + `sizeLabel`)
  and needed no change.

### What happens to existing data

Not lossy. `searchStatus.librarySizeLabel` defaults to `"0 B"` for the
existing singleton row and is corrected on the next library-touching
mutation (same staleness window as the existing `libraryCount` field it's
computed alongside — no new behavior class introduced).

### Tests covering this change

- Existing wikipick suite re-run green against the additive schema (no
  behavior changed beyond the two fixes above).

## 2026-08-31.pictureb2 — TOPICS (W12) + closing B1's two progress gaps (additive only)

seedVersion `2026-08-31.pictureb1` -> `2026-08-31.pictureb2` — additive only
(3 new tables: `seed_groups`, `seed_group_members`, `topic_stats`; 2 new
columns: `seed_groups.articleCount`, `searchStatus.groupCount`), nothing
removed/retyped; `tool/check_compat.sh` needs no acknowledgement;
`content.json` untouched.

**Engine additions** (flutterboard, landed dev f0c8fba4->75931eb, promoted
main c0bfd62->3af0bc1, kEngineBuild `+stat-raw-cards-splitbar-nav-sublist-
0831.1`), each confirmed genuinely missing before adding: `stat` node
`raw: true` (single-row RAW TEXT passthrough, no numeric coercion — the one
gap B1 flagged: every other stat mode computes a NUMBER; used here for
`queueStatus.currentFetchTitle`'s live "Downloading: <title>" line and the
Topic screen's name/size display); `cards` node `splitBar: {partColumn,
totalColumn, color?, label?}` (a slim per-row two-segment bar — cards had no
per-row inline visual primitive; used for the Saving-offline per-seed
progress bar AND the Topic screen's per-seed shared-vs-exclusive bar);
`NavSidePanel` `subListLabel`/`subItems` (a generic inline destination
sub-list under the main nav rows, declared via a new `app.navSubList: {table,
labelColumn, countColumn?, sectionLabel, openFn}` spec — wikipick's Topics
list feeds it). All additive/opt-in.

**What shipped**:
- **TOPICS (W12)** — a named GROUP of seeds sharing one link pool, user
  framing "a topic contains multiple seed articles" (id stays `seed_groups`).
  New "Topics" nav destination (4th drawer row, live count) + a Drawer inline
  sub-list (`Drawer.dc.html`'s "TOPICS" section) listing each topic by name
  with its live article count, tapping straight into that topic's detail
  screen. Topic screen: name (raw stat), seed/article/size counts, a SYNERGY
  card (topic-level shared% + count, broken out per layer L1/L2 — real
  numbers, see disclosed deviation below on the visual bar), per-seed cards
  (progress label, depth/status tags, a REAL splitBar shared-vs-exclusive
  bar, depth-change action, swipe-to-remove), "Save all" (sequential
  resume/queue under normal budgets — never parallel) + "Add seed" (a
  self-contained search sheet, saves + joins).
  Creating: from a Topic's "Add seed" (search scoped to add-to-group); from
  Library, a per-article "Add to topic…" cardAction (disclosed deviation
  below — not true multi-select).
  Deletion: `wikiDeleteTopic` removes only the topic + its membership rows,
  NEVER articles/crawls/crawl_members; `wikiRemoveSeedFromTopic` drops one
  membership row, leaves the seed untouched; full seed deletion
  (`wikiDeleteSeed`) keeps the existing W8 reference-counted semantics and
  additionally refreshes any topic that seed belonged to.
  Derivation (`_refreshTopicStats` in wikipick_net.dart): builds an
  article -> {crawlIds reaching it} map across every member seed's
  `crawl_members` (deduped by wiki+title), classifies each article's layer
  from its own depth, and counts "shared" as reached by 2+ crawls — both the
  topic-level and per-seed proportions. Falsifying tests over 2-seed and
  3-seed topologies in `wikipick_topic_synergy_test.dart`.
- **P2 progress-visibility gaps closed** (from B1's own disclosed
  deviations): (a) the Saving-offline screen now renders a live
  "Downloading: &lt;title&gt;… n/m" row via `stat`'s new `raw:true` mode,
  showIf-gated to `state=='running'`; (b) the per-seed crawl cards now show a
  REAL mini progress bar (`splitBar`, l1Fetched/l1Total) alongside the
  existing digits-only `progressLabel` subtitle.

**Disclosed deviations from the picture** (same practice as B1 — noted
rather than silently dropped): (1) Library's "multi-select seeds -> Group…"
substituted with a per-article "Add to topic…" action (`cards` has no
multi-select primitive) — same end state (a seed lands in a topic), one seed
at a time instead of a bulk gesture. (2) ~~The mockup's topic-level and
per-layer (L1/L2) proportion BARS are numbers-only here (no visual bar) — a
standalone (non-list) two-segment bar node doesn't exist yet~~ **RESOLVED
2026-09-02 (wikipick-topic-splitbar-0901)** — see that entry below: the
engine gained a standalone `splitbar` node (single-row twin of `cards`'
per-row `splitBar`) and the Topic screen's topic-level synergy bar and both
L1/L2 breakout bars now render it, closing this deviation. The per-seed
bars (the most-repeated, highest-value instance of this element, and
P2(b)'s own ask) were ALREADY real, colored splitBars from this round.
(3) ~~**bookreader find-in-article parity** (flagged, not built): the reader
mockup's 4th footer icon (magnifying glass) has no bookreader equivalent —
`findEnabledSetting` existed on notepad but was dropped in the
reskinwikipick-0825 bookreader migration (already noted in B1's own
MIGRATION entry); still a real gap, logged again here for visibility.~~
**RESOLVED 2026-09-03 (wikifind-0903)** — see the `2026-09-03.readerfind`
entry above: flutterboard ported `findEnabledSetting` to `bookreader`, and
the reader footer's 4th icon is now a real find/close-find pair.

### Tests covering this change

- `test/wikipick_topic_synergy_test.dart` (new, 4 cases) — 2-seed overlap
  (one shared article, symmetric per-seed split), 3-seed overlap (one
  article shared by all three across mixed depths), remove-seed-from-topic
  recomputes stats without touching crawls/crawl_members, delete-topic
  removes only grouping rows.
- `test/applet_lint_all_test.dart` — new host functions registered
  (`wikiOpenTopic`/`wikiDeleteTopic`/`wikiRemoveSeedFromTopic`/
  `wikiCacheAllTopic`/`wikiOpenNewTopicDialog`/`wikiOpenTopicPicker`/
  `wikiOpenAddSeedToTopic`); warning-ratchet budget 13->14 (the new `topic`
  detail screen is host-pushed only, same pre-existing "unreachable screen"
  shape as `reader`/`linkChoice`).
- `test/applet_idea_sharpening_test.dart` — the crawler-vocabulary scan's
  `dataKeys` allowlist gained `partColumn`/`totalColumn` (splitBar's raw
  column refs, same class as `valueColumn`); "Fetching:" reworded
  "Downloading:", "Cache all" reworded "Save all" (both were genuinely
  painted text tripping the reader-vocabulary-only rule).
- `test/icon_coverage_test.dart` — `workspaces`/`remove_circle_outline`
  registered in `lib/src/icons.dart`.
- B1's 12 crawl-control tests (`wikipick_seed_crawl_control_test.dart`) and
  the full delete-arc suite (`wikipick_refcount_delete_test.dart`, 26+ cases)
  re-run green, unmodified — Topics deletion never touches article/crawl
  semantics.

## 2026-08-31.pictureb1 — build to the approved W13 design target (additive only)

seedVersion `2026-08-30.distill` -> `2026-08-31.pictureb1` — additive only
(9 new columns across `crawls`/`queueStatus`/`searchStatus`, all with
defaults), nothing removed/retyped; `tool/check_compat.sh` needs no
acknowledgement; `content.json` untouched.

**What shipped**: built wikipick's core screens to the user-approved design
target (spec W13) — drawer side-panel nav (flutterboard's new `NavSidePanel`,
replacing the old bottom/nav-mode default; Home/Library/Saving offline with
live `navInfo` counts + `navExtras` Preferences/About & help/Donate — Topics
deliberately omitted, B2 scope), reader tap-summoned action footer
(bookreader `tapChrome`, hidden by default — full-bleed reading), a fixed nit
(the "Saved" indicator button was wired to the Reading-options toggle,
unrelated to its meaning — now opens the Library), and Saving offline
redone as PER-SEED cards (W11) with digits-only progress text, depth/status
tags, pause/resume, a depth-change picker, and swipe-to-delete — replacing
the old flat crawl_queue ops list.

**Schema**:
- `crawls` gains `l1Total`/`l1Fetched`/`l2Total`/`l2Fetched` (integer,
  default 0) and `progressLabel` (text, default "") — per-seed layered
  progress counts and the precomputed numeric-only subtitle string for the
  Saving-offline card (see `_refreshSeedLayerCounts` in wikipick_net.dart).
- `queueStatus` gains `currentFetchTitle` (text, default "" — the live
  "Fetching: <title>" title; computed but NOT YET rendered in ui.json, see
  the deviations note below), `navLabel` (text, default "" — digits-only
  fetched/target for the drawer's Saving-offline navInfo) and `navActive`
  (boolean, default false — mirrors state=='running', the drawer's live dot).
- `searchStatus` gains `libraryCount` (integer, default 0) — live article
  count for the drawer's Library navInfo (navInfo reads one row/column, not
  an aggregate).

**New backend semantics** (wikipick_net.dart): `wikiPauseCrawl`/
`wikiResumeCrawl` (per-seed, distinct from the existing whole-queue
`wikiResumeCrawls`) — pause sets `crawls.status='paused'`, checked at every
outer-loop boundary of `wikiFetchLayer`'s drain (the only points a
concurrent pause call could land, nothing between them crosses an `await`);
resume un-pauses then re-drains that one crawl. `wikiChangeCrawlDepth` — W13
"layer-depth changeable later": raising re-derives the newly-unlocked layer
from the crawl's own `crawl_members` at the old cap joined against the
shared `links` table (the only source of already-fetched pages' outgoing
links, since `crawl_queue` never enqueued past the old depthCap at the time),
then kicks a resume drain; lowering only narrows `_pendingRowsFor`'s
`depth <= depthCap` filter — fetched pages are never deleted.
`wikiDeleteSeed` routes through the existing `_deleteArticleRefCounted` (same
kept/purge semantics as the Library screen's delete, not a second weaker
path).

**Disclosed deviations from the picture** (engine has no primitive for
these; noted rather than silently dropped): (1) the per-seed mini progress
bar in the mockup's card — `cards` has no per-row inline visual primitive,
so the numeric `progressLabel` text carries the same information instead;
(2) the mockup's inline "L1 ▾" dropdown chip — implemented as a tap-to-open
sheet (`_openSeedDepthPicker` in app_screen.dart) since `cards` has no
per-row inline control; (3) "long-press a seed: delete" — implemented as
swipe-to-delete (cards' supported gesture; long-press/menuActions render
nothing per the standing `cards-menuactions-never-render` SCAR); (4) the
Saving-offline screen's live "Fetching: <title>…" line — `currentFetchTitle`
is fully computed and stored, but no engine primitive shows a live raw-text
single-row value as a standalone node (only aggregates/counts), so it is not
yet rendered; a future one-line engine addition (a `field`/`textFrom`-style
node) would complete this. (5) ~~the reader footer's "magnifying-glass" 4th
icon in the mockup is rendered as the existing Reading-options (tune) icon
instead — find-in-article has no bookreader equivalent (dropped in
reskinwikipick-0825), so no feature exists behind a search glyph; kept the
existing 4-icon count (Language/Contents/Open-on-Wikipedia/Reading-options)
rather than inventing a dead button.~~ **RESOLVED 2026-09-03 (wikifind-0903)**
— see the `2026-09-03.readerfind` entry near the top of this file: a real
find (`search`) / close-find (`search_off`) icon pair now sits in the
footer, wired to bookreader's restored `findEnabledSetting`; the count is 5
icons now, not 4, and the Reading-options `tune` button is unchanged/
unrelated.

### Tests covering this change

- `test/wikipick_seed_crawl_control_test.dart` — pause stops a drain cleanly
  (remaining rows stay pending, crawl status stays 'paused', not 'done');
  resume un-pauses and drains; depth-raise re-enqueues from `links` and kicks
  a drain; depth-lower narrows future draining without deleting fetched
  pages; `_refreshSeedLayerCounts` numbers/progressLabel format; delete
  routes through the ref-counted path (shared seed survives).
- `test/applet_lint_all_test.dart` — new `navInfo`/`navExtras`/action-fn
  names registered as known.

## 2026-08-30.distill — UI distillation pass (additive only)

seedVersion `2026-08-26.stalebatch` -> `2026-08-30.distill` — the build guard
requires a bump on any `columns.json` change. Additive only: one new column,
one default flipped; nothing removed/retyped, so `tool/check_compat.sh`
needs no acknowledgement; `content.json` untouched.

**What shipped**: a real-phone APK usability pass ("a bit unintuitive and
bloated ui") — Home (standing free-entry language field folded into the
dropdown, combined empty state), Search results (compact row density, hide
the wiki-language chip when it equals the active search language), Reader
actions (5-button 2-row bar collapsed to one icon row, Save stays labeled/
prominent), Reader content (Contents collapsed by default, drop-cap disabled
below 480px surface width). Plus a follow-on real-device finding on the
disambiguation page treatment ("SDL"): a duplicated "may refer to:" header
and an incorrectly-present Contents block, both traced to `isDisambiguation`
being false on that particular open — fixed with a self-healing content-shape
fallback (`_looksLikeDisambiguation`) so an already-cached row with a stale/
missing flag corrects itself on its very next open, no migration needed, plus
a body-lead-sentence dedup so the header is never doubled even when the flag
IS correctly true. Full detail: BOARD.md [wikipick-0830ui].

**Schema**:
- `searchStatus` gains `langCustomOpen` (boolean, default false) — whether
  the free-entry "any Wikipedia language code" field is revealed. Opened by
  the language dropdown's new `noWrite:true` "Other…" entry
  (`wikiOpenOtherLang`); closed again by `wikiSetLang` once a code is set.
- `liveArticle.tocOpen`'s column `default` flips `true` -> `false` — the
  in-article table of contents now opens COLLAPSED by default (one line,
  "Contents (N sections) — show") instead of the full outline occupying the
  first screen. `wikipick_net.dart`'s own `_refreshDerived`/`wikiToggleToc`
  default logic (`live['tocOpen'] == true`) was already changed to match in
  the SAME round — this column-schema default is what a genuinely FRESH row
  (before `_refreshDerived` ever runs) resolves to, so both must agree.

### Tests covering this change

- `test/wikipick_reading_test.dart` — the "in-article table of contents"
  group's default-state assertions flipped to match (collapsed on open,
  toggling opens/closes, survives a hop).
- `test/pick_dragselect_dropdown_test.dart` (flutterboard) — new case for
  the `noWrite:true` option contract (fires its action, never writes its
  value into the bound column).
- `test/wikipick_home_density_test.dart` / a new structural test covers the
  combined empty state and sectionLabel suppression.
- Full existing wikipick + flutterboard suites re-run green (see gate lines
  in the landing report).

## 2026-08-26.stalebatch — Library staleness batch check (additive only)

seedVersion `2026-08-26.wikifeel` -> `2026-08-26.stalebatch` — the build
guard requires a bump on any `columns.json` change. Additive only: no
table/column removed or retyped, so `tool/check_compat.sh` needs no
acknowledgement; `content.json` untouched (no seed rows resurrected).

**What shipped**: the last unshipped item from v2 spec §3 Freshness — the
Library-level staleness BATCH check. Once >=5 saved pages have
`lastCheckedAt` 30+ days old (or missing), the Library shows a dismissible
(per session) banner offering a bounded batch "Check for updates" pass:
oldest-first, capped at the existing per-run budget (`_kArticleCap`/
`_kByteCap`), title→revid lookups batched up to 50 per MediaWiki request
(grouped per wiki), unchanged revisions just bump `lastCheckedAt`, changed
ones re-download through the exact same refresh path
`wikiCheckForUpdates` already used (now factored into a shared
`_refreshStaleArticleContent` helper, so both call sites get identical
canonical-rename safety). Progress is written to the existing `queueStatus`
bus, so the "Saving N of M" chip/progress bar already on Home/Library/Saving-
offline shows this run too — no new progress UI. Never auto-triggered: the
banner tap is the only path to this network call, same "no silent refresh"
rule as the per-article prompt.

**Schema**: `searchStatus` gains `staleCount` (integer, default 0, live
count for the banner's own text) and `staleBannerVisible` (boolean, default
false — the only field the banner's `showIf` reads, already folding in the
>=5 threshold and the per-session dismiss since `showIf` can't do a live
numeric comparison). Both are upserted by `_refreshStaleBatchStatus`,
recomputed on boot, after a single or batch check, and after a delete.

### Tests covering this change

- `test/wikipick_stale_batch_test.dart` (new) — banner threshold (4 stale =
  hidden, 5 = visible), dismiss suppresses for the session, batch check
  bumps `lastCheckedAt` only when the batched revid is unchanged (no
  re-download), a changed revid triggers the refresh path (extract/links/
  revisionId/formatVersion all updated), the run-level article cap is
  respected, and the batched `titles=a|b|c` query shape (+ `redirects`
  from→to mapping back to the right row).
- Full existing wikipick suite re-run green (see gate line in the landing
  report) — `applet_lint_all_test.dart`/`schema_compat_test.dart` cover the
  new columns + two new registered actions.

## 2026-08-21 — crawl-fetch throttle + failure reasons (additive only)

seedVersion `2026-08-20.wikiparity-wp2` -> `2026-08-21.crawl-throttle` — the
build guard (`tool/check_schema_seedversion.sh`) requires a bump on ANY
`columns.json` change so existing installs actually re-read the new columns.
This is schema-read only, distinct from `content.json` seed re-planting (no
`content.json` touched here, so no demo rows are resurrected on existing
installs — see the seed-replant SCAR this repo tracks separately).
`tool/check_compat.sh` needs no acknowledgement — additive only, nothing
removed/retyped.

**The bug**: native crawl-fetch failures (screenshot: 29 pending / 2 fetched
/ 10 FAILED, macOS v0.7.4). Reproduced live via a real curl burst against
`en.wikipedia.org/w/api.php?action=parse`: the first ~10 rapid, unthrottled,
identical anonymous requests return HTTP 200, every one after that returns
HTTP 429 (Wikimedia's edge/Envoy rate limiter — `x-envoy-ratelimited: true`,
plain-text body, `retry-after: 11`). The crawl drain in `wikiFetchLayer`
(wikipick_net.dart) fired up to 25 fetches back-to-back with zero spacing —
far faster than any browser session — so a batch tripped the limiter, and a
tripped fetch was marked `failed` PERMANENTLY: the wrong classification for
a transient server throttle.

**The fix**: (1) a minimum inter-fetch spacing in the drain loop
(`_kInterFetchDelayMs`, test-overridable via `debugWikiThrottleMs`); (2)
failure classification + in-run retry-with-backoff for TRANSIENT reasons
only (HTTP 429 / network exceptions — `_fetchArticleHtmlForCrawl`,
backoff schedule test-overridable via `debugWikiCrawlBackoff`); a genuine
404/missing-page response is still immediately `failed`, unchanged; (3) a
"Retry failed" queue-screen action (`wikiRetryFailedQueue`) that re-queues
transient-reason failed rows (never `notFound` rows) and kicks a resume
drain, respecting every existing budget/depth cap.

**Schema**: `crawl_queue` gains `failureReason` (enum, no default —
`rateLimited`/`networkError`/`notFound`, set only on a `failed` row, cleared
back to empty by "Retry failed"). `queueStatus` gains `failedCount` (integer,
default 0), recomputed alongside `pendingCount` everywhere that already
existed — drives the new button's visibility without needing per-value
label templating. Existing rows read the new columns as absent/0 via the
same `?? ''`/`?? 0` pattern every other optional column in this codebase
already uses — no backfill needed, no data lost.

### Tests covering this change

- `test/wikipick_crawl_throttle_test.dart` (new) — throttle spacing honored
  (real timestamps), 429 -> in-run retry -> success (budget charged once,
  not per attempt), retries-exhausted -> failed with reason (`rateLimited`,
  `networkError`), `notFound` never retried (one call only, matching the
  pre-existing correct behavior for that class), and the "Retry failed"
  action (re-queues transient rows, leaves `notFound` alone, no-op when
  nothing failed). Real network never touched — `debugWikiFetchClient`
  (`package:http/testing.dart` `MockClient`), the same seam
  `wikipick_fetch_jump_test.dart` already established.
- Full existing wikipick suite re-run green, including
  `wikipick_crawl_scale_test.dart` (its 5000-row drain is dedup-hit only, so
  it never reaches a real fetch and is unaffected by the new throttle) and
  `applet_lint_all_test.dart`/`schema_compat_test.dart` (new column +
  `wikiRetryFailedQueue` action registered and lint-clean).

## 2026-08-20 — W7 images + cache depth (additive only)

seedVersion `2026-08-19.seedsaved-flag.1` -> `2026-08-20.w7-images-depth.1`.

**Additive, non-breaking** — no table/column removed or retyped, so
`tool/check_compat.sh` needs no acknowledgement; this entry is a record, not
an audit trail for a break. New: `articleImages` table (`articleId`, `mime`,
`b64`, `w`, `h`, `bytes` — one lead-image payload per article, per the W2
design of record) and `saveOptions` table (single-row scratch: `includeImages`
default false, `cacheDepth` default 1 — the per-save controls). `articles`
gains `imageBytes` (default 0) and `totalBytes` (default 0, = extractBytes +
imageBytes). Existing rows read these as 0/absent via the same `?? 0` pattern
every other optional column in this codebase already uses — no backfill
needed, no data lost. `crawls.depthCap` (already existed) is now genuinely
driven by the per-save "Cache depth" choice instead of always being hardcoded
to 1.

## 2026-08-18 — timestamp columns `date` -> `dateTime` (polish1-0818, finding 2)

seedVersion `2026-08-18.home.1` -> `2026-08-18.datetime-fix.1`.

**Acknowledged BREAKING schema change** (retype): `tool/check_compat.sh`
reports six columns retyped `date -> dateTime`, and this file is the audit
trail that accepts it. The applet id (`wikipick`) and store namespace
(`isan_wikipick`) are UNCHANGED.

### The bug this fixes

A polish-loop tester round reported the reader's freshness badge reading
"3h ago / Cached" for an article saved seconds earlier in the same live
session — reproduced twice (immediately after save, and again after a full
reload), and re-reproduced live during this fix round ("5h ago" immediately
after a fresh save). It looked like a UTC-vs-local timezone bug in the
relative-time formatting. It was not.

**Root cause:** `articles.fetchedAt`, `articles.lastCheckedAt`,
`crawl_queue.discoveredAt`, `crawls.startedAt`, `liveArticle.fetchedAt` and
`recentReads.when` were all declared `"type": "date"`, but every write site
(`wikipick_net.dart`) stores a full `DateTime.now().toIso8601String()`
timestamp. The ENGINE's own column coercion (`datakit`'s `coerceValue`,
`DataType.date` case) silently truncates any value written to a `date`
column down to its bare calendar day (`_ymd`, e.g. `"2026-08-18"`) on every
`addRow`/`setField` — the time-of-day is dropped before it ever reaches
storage. The reader's "Cached" `stat` (table `liveArticle`, `format:
"relative"`) then parses that bare date string as **midnight local time**
and diffs it against the real `DateTime.now()` — so the badge always shows
"however many hours have passed since midnight today", regardless of when
the save actually happened. That number happens to look exactly like a
timezone-offset artifact (a few hours, non-zero, seemingly arbitrary),
which is why it read as a UTC/local bug rather than a column-type bug.

### The fix

Retype all six columns to `"dateTime"` (`coerceValue`'s `DataType.dateTime`
case keeps the full ISO-8601 string, time-of-day included) — no code change
needed in `wikipick_net.dart`; it was always writing correct full timestamps,
they were just getting truncated on the way into storage. A new unit test
(`test/wikipick_freshness_test.dart`) locks the exact failure mode: writes a
known "now", asserts `relativeTime` reads back "just now" (not several hours
off), and separately asserts a `date`-typed column WOULD truncate (documenting
why the retype, not a formatting tweak, was the fix).

### What happens to existing data

**Not lossy, but historically imprecise for rows saved before this fix.** A
`dateTime` column still parses a bare `"2026-08-18"` string fine (`DateTime.
tryParse` reads it as local midnight) — no row disappears, no value is
rejected. An article saved *before* this fix keeps showing its (wrong,
midnight-anchored) freshness badge until it is re-fetched or re-checked
("Cache linked pages" / "Check for updates" both call `DateTime.now().
toIso8601String()` again and overwrite the column with a real timestamp).
No migration code re-writes old rows — the bug was cosmetic (a mis-reported
"how long ago", nothing computed off it gates a real feature: `staleDays`
freshness banners work off `lastCheckedAt` too, so a pre-fix install may show
"stale" a little early/late until its next check, never destructively).

### Tests covering this change

- `test/wikipick_freshness_test.dart` (new) — the falsifying regression:
  saves a known "now", asserts the reader's relative-time reads "just now"
  through the real `relativeTime` helper against a real `dateTime`-coerced
  value; a second case demonstrates the OLD `date`-typed coercion actually
  truncating (proving the root cause, not just patching the symptom).
- `test/wikipick_reading_test.dart`, `test/wikipick_save_persistence_test.dart`,
  `test/wikipick_queue_resume_test.dart` — full existing wikipick suite
  re-run green against the retyped schema (no other behavior changed).

## 2026-08-20.perf-scale.1 — crawl-scale performance fix + cosmetic labels

Additive-only schema change: `depthCap` (integer, default 1) added to
`articles` and `liveArticle`. Pre-existing rows read the default (1),
matching the pre-W7 always-depth-1 behavior — no data is reinterpreted or
lost, and no migration code is needed.

### What changed

- **Perf**: `wikiFetchLayer`'s crawl-resume drain, `_commitSeedSave`'s
  outgoing-link/crawl bootstrap, and `_deleteArticleRefCounted`'s delete +
  cascade + closing sweep now batch their mutations through
  `BoardState.runAsSingleUndo` instead of leaving every `addRow`/`setField`/
  `deleteRow` call to snapshot the whole database independently. A resume
  against a crawl_queue that had grown into the thousands (a hub article's
  depth-2 discovery) used to freeze the tab for 1-3 minutes; see
  `wikiFetchLayer`'s doc comment for the full root-cause writeup.
  `wikiFetchLayer` also replaces its old O(table size) `_findArticle`/
  `_hasMembership` linear scans with in-memory Sets/Maps built once per
  drain and kept in sync with rows the run itself adds.
- **Cosmetic**: the reader's "Cache linked pages" button used to say
  "— 1 layer" unconditionally, even for a depth-2 save; it now reads the
  article's actual `depthCap` (two showIf-gated button variants, since the
  engine's button label has no per-value templating). The Library/home
  caption's stale "text only, no images" line (pre-W7 wording) is updated to
  "images are optional per save" across en+ko.

### What happens to existing data

Not lossy. `depthCap` defaults to 1 for every row saved before this change
(matching what those rows' crawls actually did, pre-W7), so no article's
apparent behavior changes; the corrected label simply becomes accurate going
forward for any NEW depth-2 save.

### Tests covering this change

- `test/wikipick_crawl_scale_test.dart` (new) — synthesizes a 5000-row
  pending queue + 500-article library and asserts a resume drain and a full
  delete each complete under a generous CI-safe time budget; guards against
  the O(rows × db size) regression this round fixes.
- Full existing wikipick suite re-run green against the additive schema (no
  other behavior changed) — delete-arc adversarial semantics (five prior
  rounds) preserved exactly; only the batching/notification-timing changed,
  not what gets purged/kept.
