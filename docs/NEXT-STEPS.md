# Next Steps — Based on Analysis of Last 100 Commits (Mar 3–7, 2026)

> **Status update 2026-07-20:** this March-2026 roadmap is ~85% complete and now mostly historical.
> Item statuses below were re-verified against the current codebase. Still genuinely open:
> the tail of **#12** (`admin-panel.js`, `input-flow-settings.js`, `projects-settings.js`
> untested). #14 is partially addressed.
> The Metrics table at the bottom reflects March 2026; current figures: `main.js` **2,133**
> lines, **75** unit-test files / **1,853** tests, **18** e2e specs.

## Sprint Summary

100 commits in 4 days: 16 features, 10 bug fixes, 6 design improvements, 1 test commit.
Major theme: **Cockpit/gamification UX overhaul** with landscape-first layout, mission control, skill levels, and leaderboard.

---

## P0 — Critical Bugs ~~(Fix Immediately)~~ RESOLVED

1. ~~**`_contrastMul` ReferenceError**~~ — Already fixed in prior commits (now module-level `let` at line 473).

2. ~~**i18n greeting key mismatch**~~ — Already fixed (code correctly uses `homeScreen.*` keys).

3. ~~**Desktop header missing at 1280px**~~ — Already fixed (landscape auto-hide correctly guarded by `innerHeight <= 450`).

---

## P1 — Stabilization (Before Adding More Features)

4. ~~**Write tests for 16 new features**~~ — DONE: the suite grew from ~490 to 1,853 tests across 75 files, covering issues/comments, cockpit, heat map, measurement rail, and edge modes.

5. ~~**Test cockpit components**~~ — DONE: all six cockpit files have dedicated unit tests (`cockpit.test.ts`, `action-rail.test.ts`, `completion-engine.test.ts`, `intel-strip.test.ts`, `quick-wins.test.ts`, `session-tracker.test.ts`).

6. **Fix remaining 23 open design audit issues** — From `app_state_2026-03-04/ISSUES.md` and `current_app_design/ISSUES.md` (69 tracked, 46 fixed, 23 open/deferred). *Historical — later superseded by the July 2026 audit series in `docs/audit_*.md`.*

---

## P2 — Technical Debt

7. ~~**Break up `main.js` (12,315 lines → target <5,000)**~~ — DONE, exceeded target: `main.js` is now **2,133 lines**, with the monolith extracted into ~24 sibling modules in `frontend/src/legacy/`.

8. ~~**Update CLAUDE.md**~~ — DONE: CLAUDE.md now documents the modularized legacy core, cockpit, Issue node type, heat maps, and `/api/issue-comments`, and is re-verified periodically.

9. ~~**Replace silent catch handlers**~~ — DONE: Added `console.warn` to 11 listener/data-handling catch blocks. Remaining ~30 are legitimately silent (localStorage quota, DOM detection, WS close).

10. ~~**Remove debug logging**~~ — DONE: Removed coordinate import debug statements from `coordinates.js` and `main.js`.

11. ~~**Audit `three.js` dependency**~~ — DONE: `three` moved to devDependencies (bundled only into the lazily imported `three-vendor` chunk).

---

## P3 — Medium-Term Improvements

12. **Add tests for admin panel modules** — MOSTLY DONE: tests exist for `admin-features`, `admin-fixes`, `admin-organizations`, `admin-settings`, `admin-statistics`, `admin-users`. Still untested: `admin-panel.js`, `input-flow-settings.js`, `projects-settings.js`.

13. ~~**Verify WiFi TCP socket plugin**~~ — RESOLVED 2026-07-20 by removal: the WiFi TCP adapter targeted a plugin API that doesn't exist (`registerDataListener` vs the real polling `read()`, wrong plugin name) and had no UI entry point, so it could never have worked. `wifi-adapter.js` and all references were deleted; GNSS paths are now Bluetooth SPP, TMM/browser location, and mock.

14. **Centralize state management** — PARTIALLY DONE: `state/event-bus.js` and `state/app-store.js` now exist and newer modules use them, but the older singletons (`gnssState`, `menuEvents`, `authGuard`, `syncService`) remain uncoordinated.

15. **Performance audit on Galaxy Note 10** — Superseded by the 2026-07-19 perf pass (Lighthouse 56→88: lazy React/Leaflet, self-hosted fonts, vendor-only chunking).

16. ~~**Improve type safety**~~ — DONE: tsconfig now has `strict: true` (`strictPropertyInitialization` off).

17. ~~**E2E tests for cockpit UX**~~ — DONE: `frontend/tests/e2e/cockpit.spec.ts`.

---

## Metrics (March 2026 — historical; see status note at top for current figures)

| Metric | Value |
|--------|-------|
| `main.js` lines | 12,315 (was ~8,300) |
| Source files | 98 |
| Test files | 28 |
| Tests | ~490 |
| Untested source files | 30+ |
| Open design issues | 23 |
| Silent error catches | 11 fixed, ~30 legitimately silent |
| Skipped tests | 0 (good) |
| Commented-out code | Minimal (good) |
