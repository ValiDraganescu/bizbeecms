# Bulk translate missing translations (one go)

Status: delivered

## Brief

Fill every missing translation in one action instead of one click per field. "Missing" = the locale key is absent from the field's locale object (renderer currently falls back to default). Existing translations are NEVER overwritten; source text is always the default locale. Every model call goes through the existing quota gate (`aiQuotaDenial`) and metering (`meterAiCall`).

### Acceptance criteria

**A. Item level (collection item edit form)**
1. The edit form shows a "Translate missing" action when the open item has ≥1 translatable field with default-locale source text and ≥1 missing target locale.
2. Clicking it fills all missing field×locale slots in ONE `/api/translate` call (fields map × target locales), merges results into the open draft via the existing concurrency-safe merge, and the user still hits Save. Per-field slots that already have text are excluded from the request.
3. Busy/disabled/error UX matches the existing per-field translate (timeout → 504 message, quota → 429 message); the per-field buttons stay usable and unaffected.

**B. Collection level (collection toolbar)**
4. The collection page toolbar gets a "Translate all missing" button. It sweeps every non-archived item in the collection.
5. Items are processed sequentially (one model call per item, missing-only fill) and saved directly through the normal item write path (`item-write` coercion) — published items go live immediately. Items with nothing missing are skipped without a model call.
6. Progress is visible (e.g. "item 3/6"), one item's failure doesn't abort the sweep, and a final summary reports items updated / translations added / skipped / failed. Quota exhaustion mid-sweep stops the sweep and says so.

**C. Page level (page builder)**
7. The page builder gets a "Translate missing" action covering the page's meta title/description AND all translatable block props on that page, missing-only, in one go. Writes match the existing per-field page translate: vetted client-side merge into the builder draft (autosave → publish purges cache) for blocks, SEO-form `PUT /api/pages` (edge purge) for meta. [AMENDED 16:37 — brief originally said `applyTranslation`; that path writes live blocks, bypasses drafts, and applies unrequested source-seed slots, violating the never-overwrite guarantee. PM ratified the worker's deviation.]

**D. Correctness & limits**
8. Fields with empty default-locale source are skipped (nothing to translate from).
9. A single call's payload respects the 16KB/field cap and output-token budget — when an item's missing matrix is too large, it is chunked across multiple calls rather than silently truncated; `missing[]` in a response is retried once in a follow-up call before being reported as failed.
10. Sites with a single content locale never show any of the new buttons.

### Non-goals
- Re-translating / overwriting existing translations (no "force" mode).
- An all-pages sweep (page-level only for pages; collection-level sweep is collections-only).
- Component develop-tab prop sweeps.
- Any change to how locales are configured or to the per-field translate UX.

## Plan

**Workspace**: main working tree (no other feature in flight; user's dev server points here). All code under `CMS/`.

**Architecture decisions (PM):**
- Client-orchestrated sweeps, no new server batch endpoint. Browser computes the missing matrix, calls the existing `POST /api/translate` (`persist:false`) per item/group, then saves through the existing item write path (collection) or page persist path (pages). Avoids Workers wall-clock limits, keeps per-call 60s aborts, natural progress UI.
- Missing-only without API changes: group fields by identical missing-locale-set → one `/api/translate` call per group (common case "new language added" = 1 group = 1 call). Chunk groups when source bytes threaten the output-token budget. Retry a response's `missing[]` slots once.
- All planning logic (missing matrix, grouping, chunking, retry set) is a pure lib with unit tests; UI components just execute the plan sequentially.

**Gauntlet**: risky/core (direct writes to published content, touches AI cost path) → implement → refactor pass → code review → test review → QA. Refactor pass (user-requested 16:24, now also in SKILL.md): sweep touched files for simplification/reuse; collection-items.tsx is at 947 LOC — decompose it.

**Tasks** (sequential — shared surfaces incl. i18n message files):
- T1 `orc-backend`: pure planner lib `CMS/src/lib/content/bulk-translate-plan.ts` + unit tests. Inputs: collection schema (or page prop specs), item locale objects, content locales, size budget. Outputs: ordered call plan `[{fields:{name:src}, toLocales:[...]}]` + per-slot bookkeeping. No UI, no route changes.
- T2 `orc-frontend`: item-level "Translate missing" in the collection item edit form (`collection-items.tsx` / `field-input.tsx` area) using the planner + existing concurrency-safe merge; collection-level "Translate all missing" toolbar sweep with progress, per-item error tolerance, quota-stop, final summary, direct save via the existing item update API. Hide both on single-locale sites.
- T3 `orc-frontend`: page-builder "Translate missing" (meta title/description + translatable block props) using the planner; persist via existing page path with cache purge. Hide on single-locale sites.

**Verification (PM)**: typecheck + touched tests after each task; browser check on :3601-adjacent CMS dev flow via the live site editor; walk brief criteria 1–10 at close.

## Log
- 2026-07-24 15:4x clarified scope with user: both item+collection levels, direct write for the sweep, collections + page-level.
- 2026-07-24 16:00 brief approved by user; plan written; cleaned PRD-era cruft from orc-backend.md/orc-frontend.md.
- 2026-07-24 16:01 T1 dispatched to bt-planner (7175C6A0, orc-backend): pure planner lib + tests.
- 2026-07-24 16:07 T1 result claimed (1b52191, 33 tests, suite 2260 green) — REJECTED on verify: planner file contains a raw NUL byte (grouping-key join), git records it as binary/unreviewable. Sent back for escaped or printable separator. (Correction class: raw control chars in source — watch for recurrence.)
- 2026-07-24 16:09 T1 ACCEPTED: amended 4a1a67d, file diffs as text, PM re-ran tsc (clean) + npm test (2260/2260). Planner code read in full — grouping/chunking/missing semantics match brief. bt-planner closed.
- 2026-07-24 16:10 T2 dispatched to ft-collections (5FBF3756, orc-frontend): item-level button + collection sweep on top of planner.
- 2026-07-24 16:23 T2 ACCEPTED (b579db0): PM read full diff (shared executor refactor faithful, sweep locks editing, vetted-slots-only merge), re-ran tsc clean + npm test 2275/2275, confirmed query route supports archived=live. Worker flagged: browser QA pending (no chrome tools), `npm run lint` broken repo-wide pre-existing (next lint removed in Next 16) — out of feature scope, report to user. ft-collections closed.
- 2026-07-24 16:24 user added requirement mid-flight: refactor/simplification pass after implementation, esp. files ≥1000 LOC → added to SKILL.md gauntlet + this plan. collection-items.tsx at 947 LOC = decompose target.
- 2026-07-24 16:25 T3 dispatched to ft-pages (15E746B5, orc-frontend): page-level translate-missing (meta + block props), match existing page persist path, escalate if unvetted server writes possible.
- 2026-07-24 16:36 T3 ACCEPTED (4c31bdf): worker correctly refused applyTranslation (live-blocks write, bypasses drafts, source-seed extras) → draft-state merge + SEO PUT instead; Brief AC7 amended to ratify. Unset props untouched by design (would freeze component defaults into page). PM re-ran tsc clean + npm test 2286/2286. ft-pages closed.
- 2026-07-24 16:37 T4 (refactor pass) dispatched to rt-refactor (3C730CDB, orc-frontend): decompose collection-items.tsx (947 LOC, mandated), sweep all touched files, behavior-preserving.
- 2026-07-24 16:45 T4 ACCEPTED (7dbc5d3): collection-items 947→338 (5 extractions), spinner/api-error primitives, PM re-verified tsc + 2286/2286. Worker rejections ratified EXCEPT page-builder-shell (1364 LOC, touched) — rule says decompose; T4b re-tasked to same worker. Follow-up candidates parked: errorOf dedup in 4 out-of-scope files, toolbar extraction, shared translate-button shell.
- 2026-07-24 16:52 T4b ACCEPTED (95a8d50): page-builder-shell 1364→829 (use-block-editor hook, preview/layers/inspector panels), PM re-verified tsc + 2286/2286 + /admin/page-builder 200. rt-refactor closed. Implementation frozen.
- 2026-07-24 16:53 cleaned PRD-era cruft from orc-review/orc-qa/orc-test-review agent files; CR1 code review dispatched to cr-review (A4CD2AA6, orc-review): all 5 commits, adversarial missing-only invariant hunt, money paths, refactor behavior-preservation.
- 2026-07-24 17:00 CR1 verdict: needs-changes, 3 findings — (1) page meta PUT merges into stale click-time page snapshot (never-overwrite breach vs mid-run SEO edits); (2) sweep PATCHes from up-front-fetched stale item base (wholesale revert of concurrent edits) → fetch fresh per item; (3) translatable-field.tsx still hand-rolls the executor. Vetting/quota/refactors verified clean. cr-review kept open for re-review.
- 2026-07-24 17:01 T5 (CR1 fixes) dispatched to ft-fixes (BC24B974, orc-frontend).
- 2026-07-24 17:08 T5 result (a682d3a): latestPage ref + fill-only mergePageMeta (human mid-run edit wins), sweep fresh-fetches per item via injected port + failure tolerance + tests, translatable-field converted to shared executor. PM verified tsc + 2289/2289. Sent to cr-review for re-review.
- 2026-07-24 17:10 CR1 re-review: SHIP — all 3 findings verified closed by reading (ref safe via page-id key + alive guard; fresh-fetch base correct via parseLocalizedRow; executor conversion equivalent). cr-review + ft-fixes closed. Status → verifying.
- 2026-07-24 17:10 TR1 test review dispatched to tr-tests (F1AE97DC, orc-test-review): 3 feature test files, coverage judgment + banned patterns + no-weakening check across 7090c59..a682d3a. QA browser pass will be done by PM (workers lack chrome tools).
- 2026-07-24 17:11 TR1 verdict: PASS (62 tests, no banned patterns, checklist fully covered, no pre-existing test weakened). Advisory gaps → T6 dispatched to bt-testgap (9F75E056, orc-backend): save-before-abort quota test + unused import. tr-tests closed.

## Retro

**Q1 — worker corrections?** Three: (a) bt-planner shipped a raw NUL byte in source (file went binary in git) — one-off, logged, not yet an instruction (watch for recurrence); (b) ft-pages correctly refused the brief's `applyTranslation` instruction — root cause was the PM's brief, see Q2; (c) rt-refactor deferred the 1000-LOC rule on page-builder-shell as "pre-existing" — overruled; rule wording hardened in SKILL.md + pm-process.md.

**Q2 — user/scope corrections after brief approval?** One user process addition mid-flight (refactor pass, esp. ≥1000 LOC files) → permanently added to SKILL.md gauntlet + pm-process.md. One PM self-inflicted brief error: AC7 named a persistence path (`applyTranslation`) that violated the feature's own invariant → lesson in pm-process.md (verify named paths, or word ACs by outcome).

**Q3 — process creaks?** Stale-snapshot writes emerged as THE bug class for client-orchestrated sweeps (both CR1 breaches) → codified in pm-process.md so future sweep briefs demand read-before-write + fill-only merges up front. Cadence itself ran clean: 8 workers, all dispatches verified, no timers, no desyncs.

**Final QA (PM, browser + D1):** item button filled 6 slots on tasting-menu-2for1 and self-disabled; sweep reported "Updated 4, added 24 translations, skipped 2, failed 0" with edit-lock active and progress visible; weekday-lunch-15 byte-identical after sweep; all updated fields have en unchanged + 4 non-empty locales; page /offers meta filled all locales via draft/SEO path with blocks byte-identical; zero console errors.

**Parked follow-ups:** errorOf dedup in 4 out-of-scope files; toolbar extraction; shared translate-button shell; repo-wide `npm run lint` broken (next lint removed in Next 16) — pre-existing.
