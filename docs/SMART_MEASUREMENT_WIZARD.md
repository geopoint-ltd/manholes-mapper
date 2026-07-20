# Smart Measurement Wizard — Unified Design

Synthesis of the four lens proposals (hydraulics, surveyor-workflow, data-integrity, enterprise-ux) into one buildable design. Conflict resolutions are called out inline and summarized in §6.

## Status (updated 2026-07-20)

- **Phase 1 SHIPPED** — commit `b2e89a2`, 2026-07-20, SW v143: Z-aware auto-connect, CONNECT screen, `F.reverseEdge`, `edge.direction_source` on all creation paths, edgeExists ping-pong killed. Implementation deviations from this spec are annotated inline with **[shipped: …]** notes.
- **Phases 2–4 PENDING** (`F.attachMeasurementToNode` and `F.splitEdge` do not exist yet).
- **Related:** per-node measurement history (`node.measurements`, `utils/measurement-history.js`) shipped separately in `d1a5d26` the same day — it runs in `tsc3-handlers.js` *before* the auto-connect block on every shot, and supersedes §4's "multi-shot history: not added" line.

---

## 0. Core policy (governs everything below)

Every smart condition resolves to exactly one of four tiers **before any UI renders**:

| Tier | Behavior | Cost |
|---|---|---|
| **AUTO** | Act silently, confirm with a numbers-rich success snackbar + Undo action | 0 taps |
| **SUGGEST** | One screen/card with the recommended answer pre-selected; tap = accept + advance | 1 tap |
| **ASK** | One screen, equal-weight choices, no pre-selection; deliberate tap required | 1 tap |
| **WARN** | Non-blocking: badge, inline row, or transition-only snackbar with action button | 0 taps |

Screen budget: **a normal shot sees exactly two windows** (type dialog + connect screen), and the connect screen is skipped entirely when the AUTO tier fires. Anomaly screens appear only when triggered; simultaneous conditions merge into **cards/rows on one screen**, never stacked modals. Evidence is always numeric ("ΔZ 0.45 מ' · ‎1.2% · 38 מ'"), per the existing toast convention (`tsc3-handlers.js:137-143`).

All slope/length/Z math goes through the existing pure functions — `computeEdgeGradient` (accepts hypothetical `{tail, head, tail_measurement:'', head_measurement:''}` edges), `edgeLengthM`, `elevationOf` (Z=0 sentinel) in `features/gradient-engine.js`. All mutations go through `F.createNode` / `F.createEdge` / `F.reverseEdge` (shipped in Phase 1) / new `F.splitEdge` (Phase 4) / new `F.attachMeasurementToNode` (Phase 2) so the read-only guard, admin defaults, undo-redo, and gradient hooks come free.

---

## 1. The wizard flow

Rides the existing serialized point queue (`_pointQueue` in `survey/tsc3-connection-manager.js`) — one shot = one wizard pass; rapid shots queue. If the field stepper is open on a **different** node, the entire pass queues behind the existing non-focus-stealing snackbar chip (`notifyStepperOfExternalNodeUpdate` contract). No hash changes anywhere (avoids the popstate exit guard).

1. **Point arrives** (`_handleIncomingPoint`). Parser validation as today.
2. **Coordinate sanity gate** *(conditional, pre-identity)* — far-from-site check (A5). Fires rarely; Discard pre-selected.
3. **Identity gate** *(conditional)* — in order:
   a. `pointName` matches an existing node id → re-measure path; if deltas are large, the **re-measure delta confirm** (A2) interposes; otherwise silent update as today, then step 9.
   b. No name match but within duplicate radius of a **surveyed** node → **duplicate-node guard** (A1), pre-selected "Update node X".
   c. No name match but within ~2 m of an **unmeasured planned** node → **attach-to-planned banner** (A3) rendered atop the type dialog (still one window). Attach skips type choice (type already known) → step 8.
4. **Type dialog** (existing `survey-node-type-dialog.js`, upgraded): last-used type pre-highlighted + usage-ordered buttons (D1); missing-Z amber banner (A4) when elevation is the 0 sentinel; **auto-connect checkbox removed** — the connect step replaces it. Cancel still discards the point.
5. **Node created** — `handleTSC3PointReceived` runs through `applyCoordinatesIfEnabled()` exactly as today, **then** the suggestion engine runs (fixing the dangling-edge check that currently runs at canvas center — C4).
6. **Tier decision** by the suggestion engine — **[shipped as `suggestChainConnection(newNode, prevNode, ctx)` in `features/connection-suggest.js`, returning a single suggestion object `{kind, tail, head, reason, …}` (kinds: none/exists/flip-offer/auto/auto-home/ask), not an array with a `tier` field]**:
   - **AUTO** (B2): unambiguous → edge created silently in the Z-correct direction, snackbar + Undo, skip to step 8.
   - **Nothing to connect** (B1: first shot / no candidate in range): skip to step 8, zero UI.
   - Otherwise → step 7.
7. **CONNECT screen** *(the one new window — implemented as a field-stepper screen type, prepended to `getScreenSequence()`)*. One screen hosting, in fixed order, only the cards that fired:
   - on-run split card (B6) — takeover position when it fires
   - dangling-edge adoption card (B5)
   - existing-edge flip card (B4)
   - **primary direction card** (B3/B3a/B3b) with evidence line and swap chip **[shipped as two separate direction cards (tail→head / head→tail) + a "ללא חיבור" card — behaviorally equivalent, no swap chip]**
   - candidate chip row (B7, max 3 + "Pick on map…" + "ללא חיבור"), with slope/distance/cross-network badges (C1, C2, C3) inline
   - Home-lateral variant (B8) replaces all of the above when nodeType is Home.
   Tapping a candidate chip recomputes the direction card **in place** — never a second window. Accept = create via `F.createEdge` + auto-advance.
8. **Field stepper** (existing, unchanged sequence) — plus the tappable header type icon for one-tap type correction (D2).
9. **DEPTHS screen** (existing) — hosts the inline post-commit correctors: invert-basis flip card (B9), drop-manhole prompt (C5), diameter-monotonicity row (C6), with the depth input for the just-created edge offered first (D3).
10. **COMPLETION screen** (existing) — gains one summary line: connections made + "N checked by terrain only — enter depths to confirm direction" jump chip (C7).
11. **Post-commit, non-blocking** — bifurcation watch (C8) and re-measure revalidation flip offers (B10) fire as transition-only snackbars only.

---

## 2. Smart-condition catalog (deduplicated, prioritized)

### A. Anomaly guards (protect the data at the door)

| # | Condition | Trigger (real fields) | Action | UI | Tier |
|---|---|---|---|---|---|
| **A1** | Duplicate node nearby | No `pointName` match AND `hypot(easting−n.surveyX, northing−n.surveyY) ≤ 1.5 m` (admin-config; merged from hydraulics' 0.5 m and integrity's 1.5 m — 1.5 wins: manhole diameter + rover error) for any node with `hasCoordinates` | Route into the existing `isNew=false` re-measure path instead of minting a ghost node | Screen before type dialog: "Update node 104 (0.8 מ')" pre-selected / "Create new" / "Discard" | SUGGEST |
| **A2** | Silent re-measure with large delta | Name match AND (horizontal delta > 0.5 m OR \|ΔZ\| > 0.20 m vs stored `surveyX/Y/Z`) | Confirm before overwriting good data | Before/after E,N,Z table; Overwrite pre-selected / Keep / Save-as-new | SUGGEST |
| **A3** | Shot lands on planned (unmeasured) node | No name match, node **without** `hasCoordinates` within ~2 m (via `manual_x/manual_y` or projected canvas pos) | Attach measurement to the planned node, preserving id/edges/fields (new op) | Banner card atop the type dialog; Attach = 1 tap, skips type choice | SUGGEST |
| **A4** | Missing elevation (Z=0 sentinel) | Parsed `elevation === 0` or candidate's `elevationOf()` unset | Suppress ALL slope logic for the pair; rank by distance/chronology only; disable AUTO tier | Amber banner on type dialog + grey "אין Z" badge on candidate chips — never a modal (integrity lens wins over hydraulics' inline-notice; identical intent) | WARN |
| **A5** | Point far from site | ≥3 surveyed nodes exist AND distance from their bounding box > 1 km (admin-config) | Offer discard before it wrecks zoomToFit and proximity checks | Interstitial before type dialog; Discard pre-selected | ASK |
| **A6** | Z outlier vs neighbors | Elevation truthy AND nearest surveyed neighbor ≤ 100 m has truthy `surveyZ` AND implied slope > 15% or \|ΔZ\| > 3 m over < 30 m | Flag probable pole-height blunder | **Resolved conflict**: NOT a dedicated screen (integrity wanted one; screen-budget rule wins) — red badge + warning row on the connect screen's direction card; accepting requires the normal confirm tap | WARN |
| **A7** | GNSS precision gate | GNSS path only: `fixQuality < 4` or `hrms > 0.015` or `vrms > 0.020` (existing `DEFAULT_MEASURE_CONFIG`) | Wait / accept-as-Schematic (`accuracyLevel=1`) / discard | Live-updating gate screen (GNSS path only; TSC3 wire has no quality metadata — accepted blind spot) | ASK |

### B. Flow-direction / Z logic + connection suggestions (the core feature)

| # | Condition | Trigger | Action | UI | Tier |
|---|---|---|---|---|---|
| **B1** | First-shot / no-candidate skip | `S.lastSurveyNodeId` null AND no `hasCoordinates` node within 70 m | Ask nothing | Connect screen doesn't exist for this shot | AUTO (no-op) |
| **B2** | Confident chain auto-connect | isNew AND previous chain node is ALSO the top spatial candidate AND distance ≤ 70 m AND both `surveyZ` truthy AND \|ΔZ\| > `TOL_TERRAIN_M` (0.05) AND downhill direction is unambiguous AND no edge either direction AND nodeType ∉ {Home} AND stepper not busy elsewhere **[shipped: AUTO is not gated on stepper focus — only ask/flip-offer queue per-node]** | Create edge silently, **tail = higher-Z node** (this may flip chronological order) | Success snackbar "חיבור 104 → 105 · ‎1.2% · 38 מ'" + Undo | AUTO |
| **B3** | Downhill direction suggest | Connect screen showing, both Zs truthy, \|ΔZ\| > 0.05 — direction = orientation where hypothetical-edge `computeEdgeGradient` terrain status is ok | Pre-select downhill direction card with evidence line; swap chip flips live (slope badge goes red when swapped) | Direction card, RTL-flipped arrows, ids in `<bdi dir="ltr">` | SUGGEST |
| **B3a** | Flat/ambiguous ΔZ | \|ΔZ\| ≤ 0.05 or terrain slope < `MIN_SLOPE_PCT` **[shipped: only the \|ΔZ\| ≤ `FLAT_TOL_M` check; no MIN_SLOPE_PCT branch]** | Never guess. Two equal-weight direction chips + "אחליט בעומקים" (creates chronological direction, `direction_source:'chronological'`, re-asked at depth entry) | Same screen, no pre-selection, helper line "שטוח: הפרש 0.03 מ'" | ASK |
| **B3b** | Missing-Z direction | Either Z unset (A4 fired) | Chronological prev→new offered but badged "כיוון לא מאומת", hollow card, AUTO disabled | Degraded direction card | ASK |
| **B4** | Existing-edge dedup + flip | Pair already has edge either direction (same check as `graph-crud.js:155-163`), run BEFORE rendering. (a) same direction → suppress candidate silently, no toast ever. (b) reverse direction exists AND its gradient status is 'negative' | (b): offer `F.reverseEdge` (new op: swap tail↔head AND `tail_measurement`↔`head_measurement`, undo entry, gradient recheck) | (a) invisible — this alone kills the edgeExists ping-pong. (b) amber fix card on connect screen; **"Keep as is" pre-selected** (integrity lens wins over hydraulics — flipping is the bolder act) | (a) silent / (b) SUGGEST |
| **B5** | Dangling-edge adoption | `F.findDanglingEdgeNear(node.x, node.y)` **re-run after** `applyCoordinatesIfEnabled` (fixes the latent canvas-center bug) | `connectDanglingEdge`, direction inherited, Z-sanity-checked (contradiction → flip affordance) | Card with open-pipe icon on connect screen; within snap radius + unambiguous → AUTO with undo snackbar | SUGGEST/AUTO |
| **B6** | On-run insertion (split) | Perpendicular ITM distance to an existing surveyed edge segment ≤ 1.5 m, projection t ∈ (0.05, 0.95); confidence high when Z_new between endpoint Zs | `F.splitEdge` (new op): delete A→B, create A→new + new→B inheriting `line_diameter`/`material`/`edge_type`; A-side keeps old `tail_measurement`, B-side keeps old `head_measurement`, new ends empty; single undo entry | Takeover card: "הנקודה על הקו 102→105 — לפצל?" with both resulting slopes | SUGGEST |
| **B7** | Ranked candidates beyond "previous" | Nodes with `hasCoordinates` within 70 m (`LONG_EDGE_THRESHOLD_M`), excluding already-connected and Home (unless new is Home). Score = distance + downhill compatibility + type compatibility + dedup suppression. Both chains (`S.lastSurveyNodeId`, `gnssState.lastCapturedNodeId`) feed the set | Top 3 chips: id, distance, ↑/↓ Z glyph; tapping promotes into the direction card (recompute in place) | Horizontal chip row + "אחר…" (pan-to-pick) + "ללא חיבור". >3 → "+2 more" bottom sheet | SUGGEST |
| **B8** | Home lateral | `nodeType === 'Home'` | Candidates = nearest Manholes only; direction **locked** Home→manhole, never asked (gradient-exempt, no slope badges); `directConnection` yes/no chips on the same screen; nearest main < 15 m and unique → AUTO. **Chain pointer must NOT advance onto the Home node** (fixes `tsc3-handlers.js:98`) **[shipped with one exception: when no pointer exists yet (session opens on a Home shot), the pointer DOES take the Home node so the first main-line shot can be offered that lateral]** | Manhole-only chips, no swap chip, no direction screen | SUGGEST/AUTO |
| **B9** | Invert-basis flip at depth entry | Invert status transitions to 'negative' via `onDepthChanged`/`onMeasurementApplied` AND `edge.direction_source !== 'user'` and `!== 'invert'` | Offer flip with invert numbers; on flip set `direction_source:'invert'` (final). Decline → force-main follow-up (C9) | Inline amber card under that edge's depth inputs on the DEPTHS screen (not a modal); elsewhere → warning snackbar with Flip/View actions | SUGGEST/WARN |
| **B10** | Re-measure Z-change revalidation | isNew=false, new `surveyZ` differs > 0.05 m, touching edge transitions to 'negative' after the existing recheck | Passive flip offer via `F.reverseEdge` | Warning snackbar only — re-measures never open windows | WARN |

### C. Sanity badges & attribute intelligence (zero-screen, mostly)

| # | Condition | Trigger | Action | UI | Tier |
|---|---|---|---|---|---|
| **C1** | Slope sanity badges | Terrain slope < 0.3% → flat; > `MAX_SLOPE_PCT` (new admin const, default 12) → steep; length > 70 m → long | Demote in ranking; steep/long selection gets one inline confirm row with numbers | Color-coded badges on candidate chips; long chronological default demoted below nearer candidates with caption ("previous is 112 m away") — merges surveyor's long-jump guard and integrity's stale-chain into ranking behavior | WARN |
| **C2** | Long-jump / new-run guard | Distance to previous > 70 m AND **no** nearer candidate exists either | "Start new run" pre-selected (no edge, chain pointer resets) vs connect-anyway | Only case that earns a screen: the connect screen with "ללא חיבור" pre-selected and the distance as hero figure | SUGGEST |
| **C3** | Cross-system guard (storm/sanitary) | One endpoint `nodeType 'Drainage'`, other `'Manhole'`/`'Home'` (Manhole–Home never fires); component classification via BFS (the `findConnectedComponents` pattern) for the component-level check | Demote cross-type candidates; explicit pick → two-state confirm tap on the same card. Never block (combined systems exist) | Subdued chip style + system glyph; arm-then-commit tap | WARN→ASK |
| **C4** | Stale chain pointer | `lastSurveyNodeId` older than 4 h (`measuredAt`), deleted, or > 70 m | Change the default pre-selection to nearest plausible, caption why | Same connect screen, different default | SUGGEST |
| **C5** | Drop-manhole (מפל) detect | At node M: `outgoing.tail_measurement − incoming.head_measurement > 0.4 m`, both depths present | Prefill `fall_depth` = difference on the incoming edge; ask `fall_position` | Three chips (פנימי/חיצוני/אין מפל) appended inline on DEPTHS after the completing input | SUGGEST |
| **C6** | Diameter monotonicity | `line_diameter` set AND max upstream diameter into its tail (excluding Home laterals, ''/unknown) > this edge's | Offer upstream max as correction chip; if `direction_source !== 'invert'`, also offer flip (shrinking downstream = classic backwards arrow) | Inline warning row under the diameter chips in the DEPTHS expander | WARN |
| **C7** | Terrain-only depths reminder | Wizard-created edge still missing a measurement at COMPLETION | "1 חיבור נבדק לפי פני קרקע בלבד" + jump-to-DEPTHS chip | One summary row on COMPLETION; never blocks Save & next | WARN |
| **C8** | Bifurcation watch | Manhole out-degree (as tail, excluding dangling + Home/Drainage laterals) > 1 after any create/flip | "2 מוצאים — לבדוק כיוון?" listing both with slopes, flip offer on the more suspect | Transition-only warning snackbar with View action, AFTER the wizard completes | WARN |
| **C9** | Force-main exception | User overrides downhill recommendation or declines invert flip, leaving accepted 'negative' | One follow-up chip "קו סניקה?" → sets `edge_type='קו סניקה'` (4802) and exempts the edge from gradient alerts (engine extension) | Inline chip on the same screen, only after the override | SUGGEST |

### D. Workflow accelerators

| # | Condition | Trigger | Action | UI | Tier |
|---|---|---|---|---|---|
| **D1** | Repeat-type fast default | `S.lastSurveyNodeType` (new session var) + field-history usage ordering | Pre-highlight last type; optional admin streak mode: 3+ identical → 2 s cancelable countdown snackbar instead of the dialog | Highlight ring on type button | SUGGEST |
| **D2** | One-tap type correction | Mis-tap noticed in stepper | Tappable header type icon (44px) → type picker; switching re-runs `computeFieldOrder`, connection logic, `computeNodeTypes`, gradient exemption | 2 taps, no legacy-panel trip | SUGGEST |
| **D3** | Depth-while-standing | Edge just created for this node | DEPTHS opens pre-scrolled to that edge, this node's end focused, decimal keyboard up; "הזן עומק" action on the creation snackbar | Reuses existing DEPTHS card + `onDepthChanged` wiring | SUGGEST |
| **D4** | Typical-spacing confidence | Running median of ≥3 accepted chain lengths this session; next distance outside [0.3×, 2×] median demotes AUTO→SUGGEST | Invisible tier modifier only — never creates/suppresses candidates | None | (modifier) |

---

## 3. Suggestion-presentation contract

1. **One window at a time, one screen per decision moment.** All creation-time conditions render as ordered cards/rows on the single CONNECT screen (order in §1 step 7). Accepting a card removes it; the screen auto-advances when nothing actionable remains or on Next. Multiple conditions never chain windows — they merge into evidence rows (e.g. Z-outlier + long + crossing all appear as rows on the direction card).
2. **Post-commit conditions never open windows.** Invert flips, re-measure rechecks, bifurcation → snackbar tier only: transition-only firing with signature dedup, 10 s terrain cooldown, action buttons (Flip / View / Undo), and the existing success-toast mutual-exclusion (a warning suppresses the success toast).
3. **Accept** = one tap through the sanctioned op → undo entry → gradient hooks fire → auto-advance. **Dismiss/Skip** ("ללא חיבור" / "Not now") = no edge, counted like `skippedFields`, surfaced on COMPLETION; the standing issue engine (`not_last_manhole`, `merge_candidate`, `missing_tl`) remains the system of record — the wizard keeps no parallel nag list. **Undo** = every AUTO action carries an Undo snackbar action routed through undo-redo.
4. **Declined pair is remembered per session** (in-memory set, reset with `__gradientEngine.reset` on sketch switch) so the same suggestion doesn't reappear on the next shot.
5. **Suppression is silent.** A correct existing edge means the candidate simply never appears — no screen, no toast. No suggestion path may ever surface `toasts.edgeExists`.
6. **Never steal focus.** Stepper open on another node → the whole pass queues behind the `stepper-tsc3-queue` snackbar chip.
7. **House style, non-negotiable:** field-stepper overlay + `.field-stepper-chip-grid`/`.field-stepper-nav-btn` classes (inherits tokens, dark mode, 44px targets), RTL-flipped arrows, `<bdi dir="ltr">` for ids/coords, he+en i18n for every key, `escapeHtml` on all strings, no native selects, no hash changes.

---

## 4. Data-model gaps (all free additions in schemaless JSONB)

| Addition | Type | Justification |
|---|---|---|
| `edge.direction_source` ✅ shipped | `'chronological' \| 'terrain' \| 'invert' \| 'user'` (auto-home laterals stamp `'user'`; the re-measure recompute path also emits an internal `reason:'terrain'` ask) | Provenance for every arrow. Depth-time rechecks (B9) nag guessed directions once and never nag user-confirmed ones; C6 uses it to decide whether to offer flip. Snake_case chosen to match the `tail_measurement` family. (Naming conflict resolved: enterprise's `directionSource` loses.) |
| `F.reverseEdge(edgeId)` — **operation** ✅ shipped as `reverseEdge(edgeId, {directionSource})` | swap `tail`↔`head` AND `tail_measurement`↔`head_measurement`, keep `fall_depth` (re-ask `fall_position` if set) **[fall handling NOT yet implemented — lands with C5 in Phase 3]**, undo entry, gradient recheck | Prerequisite for B4, B9, B10, C6, C8. Also closes the standing edgeExists backlog item. |
| `F.splitEdge(edgeId, newNodeId)` — **operation** | delete + 2× create inheriting diameter/material/type, measurement redistribution per B6, single undo entry | B6. Without the explicit redistribution rule, depth data silently vanishes. |
| `F.attachMeasurementToNode(nodeId, coords)` — **operation** | write `surveyX/Y/Z`, `tl`, precision, fix quality onto an existing node, preserve id/edges | A3. Today the only merge path is the exact pointName string match. |
| `S.lastSurveyNodeType` | session var (+ field-history scope) | D1. Nothing stores the last chosen survey type. |
| Session shot log | in-memory `[{nodeId, coords, timestamp, acceptedLength}]`, reset on sketch switch | D4 spacing median; future bearing ranking. `gnssState.capturedPoints` is GNSS-only. |
| Admin threshold block in `S.adminConfig` | duplicate radius 1.5 m, on-run offset 1.5 m, candidate radius 70 m, flat tol 0.05, `MAX_SLOPE_PCT` 12, storm min-slope 0.2, fall threshold 0.4, site radius 1 km, chain staleness 4 h, lateral radius 30 m, auto-tier enable | Everything tunable via the existing adminConfig pattern; gradient-engine constants stay the single source of truth so wizard and warnings never disagree. **[Phase 1 status: thresholds are hardcoded module constants — `FLAT_TOL_M` and `LONG_EDGE_THRESHOLD_M` in `connection-suggest.js` duplicate `gradient-engine.js`'s `TOL_TERRAIN_M` and `sketch-issues.js`'s value rather than sharing them; adminConfig wiring is Phase 2]** |
| Gradient engine: exempt `edge_type === 'קו סניקה'` | engine change | C9. Engine exempts only by node type today; without it every force main earns a red snackbar → alert fatigue. |
| Persist `surveyAutoConnect`/auto-tier mode to localStorage | today session-only (`main.js:417`) | Setting survives restarts. |
| `edge.system` (`'sewer' \| 'storm'`) | **deferred** — optional, derivable from endpoint types at creation | Only needed for honest cross-connection *reporting*; C3 works off `nodeType` proxy until then. |
| **Not added:** per-node IL, rim | — | Invert stays derived (`surveyZ − depth` per edge end) — matches the engine's two-basis design; adding stored IL would create a second source of truth. **[Multi-shot history was originally in this "not added" list but HAS since shipped separately (`d1a5d26`): append-only `node.measurements` via `utils/measurement-history.js`. Note its entries store elevation as `null` when unmeasured, while the wizard's `elevationOf` treats `surveyZ === 0` as the unset sentinel — two coexisting "no Z" conventions; don't reintroduce 0-vs-null ambiguity.]** |

---

## 5. Phased implementation plan

### Phase 1 — direction-correct chaining + ping-pong fix ✅ SHIPPED (`b2e89a2`, 2026-07-20, SW v143)
- `features/gradient-engine.js`: one change was needed after all — `elevationOf` was exported (was module-private). Reuses `computeEdgeGradient`/`edgeLengthM`/`elevationOf` from the new sibling module `features/connection-suggest.js` (pure: `suggestChainConnection(newNode, prevNode, ctx) → {kind, tail, head, reason, …}` — single object, not an array; no `tier` field).
- `legacy/graph-crud.js`: add `F.reverseEdge(edgeId)` (register in `F`, undo entry via `legacy/undo-redo.js`, gradient recheck).
- `legacy/tsc3-handlers.js:89-98`: replace the blind `createEdge(prev, new)` with the tier decision: AUTO (Z-correct direction + snackbar/Undo), or set a pending-suggestion handoff for the CONNECT screen. Stop advancing `S.lastSurveyNodeId` onto Home nodes.
- `field-stepper/field-stepper.js`: add `'CONNECT'` screen type — extend `getScreenSequence()`, the `render()` switch (~line 650), and `pickStartIndex`. Minimal v1 content: direction card (B3/B3a/B3b) + swap chip + "ללא חיבור". Reuse chip-grid CSS.
- Dedup-aware by construction (B4a suppression; B4b flip card).
- Write `edge.direction_source` on every creation path.
- i18n keys (he+en) in `i18n.js`; e2e scenarios (downhill chain, uphill flip, flat ask) **[shipped instead in `frontend/tests/e2e/full-network-audit.spec.ts` (updated to Z-aware topology) + 17 unit tests in `frontend/tests/unit/connection-suggest.test.ts`; `tsc5-field-workflows.spec.ts` was not touched]**.

### Phase 2 — identity guards + candidates (PENDING)
- `survey/tsc3-connection-manager.js`: A1 duplicate-node guard and A3 attach-to-planned before/atop the type dialog; A2 re-measure delta confirm; `F.attachMeasurementToNode` in `graph-crud.js`.
- `features/connection-suggest.js`: B7 ranked candidates (spatial via `surveyX/Y` + `utils/spatial-grid.js`), C1/C2/C3/C4 ranking badges and defaults, B8 Home-lateral variant (surface `directConnection` chips).
- Fix B5: re-run `findDanglingEdgeNear` post-`applyCoordinatesIfEnabled` in `tsc3-handlers.js`.
- `survey/survey-node-type-dialog.js`: remove auto-connect checkbox, add D1 last-type preselect + A4 missing-Z banner.
- Admin threshold block in adminConfig (+ `admin/` settings UI).

### Phase 3 — depth-time truth loop (PENDING)
- B9 invert-flip inline card on DEPTHS (`field-stepper.js` `renderDepthsScreen`), C5 drop-manhole prompt, C6 diameter row, C9 force-main chip + gradient-engine edge_type exemption, C7 COMPLETION summary line, D3 depth-while-standing jump.
- B10 re-measure revalidation snackbar (hook after `onMeasurementApplied` in `tsc3-handlers.js`).

### Phase 4 — polish and long tail (PENDING)
- B6 `F.splitEdge` + on-run card; A5 far-from-site; A6 Z-outlier badges; A7 GNSS gate (`legacy/gnss-handlers.js` — also route GNSS creation through the same CONNECT flow, unifying the two chains); C8 bifurcation snackbar; D2 header type switch; D4 spacing modifier; streak auto-confirm mode.

---

## 6. Conflict resolutions (explicit)

1. **One combined connect screen vs separate candidate/direction screens** — surveyor + enterprise win over hydraulics: candidates and direction live on ONE screen; picking a candidate recomputes direction in place. Tap economy on 640×360 outranks decomposition purity.
2. **CONNECT as a field-stepper screen type vs standalone dialog** — enterprise wins: stepper screen type inherits CSS, nav, dots, dark mode, and the non-hijack contract for free; but it must participate in the `_pointQueue` gate like the type dialog does.
3. **Duplicate radius** — 1.5 m (data-integrity) over 0.5 m (hydraulics): covers real manhole diameter + rover error; admin-configurable anyway.
4. **Flip pre-selection on existing edges** — integrity's "Keep as is" pre-selected wins over hydraulics' pre-highlighted Accept: reversing committed data is the bolder act and must be deliberate.
5. **Z-outlier dedicated screen** — rejected (integrity wanted it); the screen-budget rule wins: it renders as badges/rows on the connect screen.
6. **Per-network chain pointers** (hydraulics) — deferred: the combination of "pointer never advances onto Home" + cross-network demotion (C3) covers the practical failure modes at far lower complexity; revisit if field data shows storm/sewer mis-chains persist.
7. **`direction_source` value set** — union of all lenses: `chronological | terrain | invert | user` (hydraulics' four-value set wins; 'z-suggested' maps to 'terrain').
8. **Auto-accept for type after a streak** (surveyor) — kept but behind an admin toggle and a cancelable countdown; silent type assignment is riskier than silent edges because type gates the whole field sequence.
9. **Storm/sanitary as blocking confirm screen** (hydraulics) vs ranking demotion (surveyor/enterprise) — demotion + arm-then-commit tap wins for the common case; the full component-level BFS warning fires only when the user actively joins two classified components.
10. **Happy-path cost** — hydraulics' "zero added screens" is the binding target: B2 AUTO must remain the common case, verified by the e2e downhill-chain scenario, or the feature is a regression versus today's blind chaining.