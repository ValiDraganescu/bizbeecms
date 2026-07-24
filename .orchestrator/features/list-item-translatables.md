# List: surface item-component translatables

Status: delivered

## Brief

User request (2026-07-24, approved): "RestaurantRow should define the NEW and Book a table as translatables and they should be surfaced in the List wrapping it for translation. This should be a feature of the list: to surface selected item component translatables and to use them properly while rendering."

Today a List's item-component props that aren't bound to a row field ("not bound" in MAP FIELDS TO ITEM PROPS) silently fall back to the component's authored `default` — a plain EN-only string, with NO way to edit or translate them per List. The renderer already resolves `{en, fi, …}` locale objects deep in props (`resolveLocalized` in src/lib/render/localize.ts, applied in plan-tree/tree), and page-level Translate missing already walks List templates — the gap is purely the editing surface.

### Acceptance criteria

1. In the List block's inspector (ListSettings, binding-panels.tsx), every **translatable** prop of the selected item component that is **not bound** to a row field is shown as an editable per-locale field — the same lang-tabs + per-field AI-translate widget blocks use (TranslatableField) — storing a locale object on the List's TEMPLATE child block props.
2. Binding that prop to a row field hides its static editor (row data wins, per stampRow); unbinding restores it with whatever locale object was stored.
3. Rendering: the stored locale object resolves per content locale with default-locale fallback through the EXISTING resolveLocalized path — verify, don't rebuild. Template stamping must not disturb unbound translatable props (stampRow only touches mapped names — verify).
4. Page-level "Translate missing" picks up these template-child slots (pageTranslateEntries claims any-depth coverage incl. List templates — verify with a test; fix if the template child's component schema isn't resolved).
5. All async translate merges commit via the T7 updater path against the template block's latest props; never-overwrite holds. Editor typing in these fields marks the page dirty and saves via the normal page save.
6. Single-locale sites: field still editable as plain text, no tabs/translate menu (TranslatableField's existing multi=false behavior).
7. QA fixture (local dev site ONLY — user chose not to touch restovista): mark RestaurantRow's `newLabel`/`bookLabel` translatable, set + translate them via the new List surface, prove the published/preview page renders them per content locale.

### Non-goals
- Editing unbound NON-translatable item props (unchanged behavior).
- A List-level bulk translate button (page-level Translate missing covers these slots).
- Any change to row-field binding semantics or collection-item translatable rendering.

## Plan

Workspace: main working tree. Worker: ft-race-fix (E47F5473, orc-frontend — carries T7/T8 context: updater path, TranslatableField, planner libs).

Gauntlet: standard-plus — implement → refactor pass (binding-panels.tsx is >1000 LOC and WILL be touched → decompose per pm-process.md rule) → fresh-terminal code review → PM browser QA.

Tasks:
- T9: ListSettings surfacing + render/translate-missing verification tests + local-site RestaurantRow fixture.
- T10 (same worker or fresh): binding-panels decomposition (mandated).
- CR3: fresh orc-review terminal over T9+T10.

## Log
- 2026-07-24 18:36 brief approved by user (AskUserQuestion: local dev fixture only). T9 dispatched to ft-race-fix.
- 2026-07-24 18:45 T9 ACCEPTED (7f41e33 feature + c27c8bc decomposition): ITEM TEXT section in ListSettings via TranslatableField on the template child, T7 updater path; verify-not-rebuild tests (stampRow non-interference, planPage locale resolution, pageTranslateEntries template-schema coverage); binding-panels 1630→20-line barrel + binding-controls/binding-panel/form-settings/list-settings (max 726). PM re-ran tsc clean + 2301/2301 + ssr-bind-panel-check OK.
- 2026-07-24 18:5x AC7 fixture: RestaurantRow already had newLabel/bookLabel translatable on local dev (pre-existing) — no component change needed. PM browser QA on /home RestaurantCard List (bookLabel unbound): ITEM TEXT renders; stored EN + translate-to-all → {en: Book a table, fi: Varaa pöytä, ro-ro: Rezervă o masă, es: Reservar mesa} on the template block; saved; preview with bb_content_locale=fi renders "Varaa pöytä" on EXACTLY the 3 rows of the configured List, all other lists (prop unset) fall back to EN default. AC1-6 checked. Note: one page-level Translate-missing run hit a model-stall timeout (infra flake, error surfaced correctly, re-run resumes).
- 2026-07-24 18:5x QA-found defect: floating AI-assistant launcher overlaps the inspector's LAST section controls at scroll-bottom (ITEM TEXT translate menu unclickable). T10 (bottom clearance on inspector scroll area) dispatched to ft-race-fix.

- 2026-07-24 18:55 T10 ACCEPTED (58a6b2f): pb-24 clearance on the inspector scroll container; PM browser-verified the ITEM TEXT translate menu is now fully above the launcher at scroll-bottom. ft-race-fix closed (4 tasks: T7, T8, T9+decomp, T10).

- 2026-07-24 19:18 T11 dispatched to bt-parity (9CEE5625, orc-backend): pageTranslateEntries sources from authored schema default when nothing stored (parity with blockTranslateEntries/per-field menu); shared helper, pure lib + tests.

- 2026-07-24 19:21 T11 ACCEPTED (3e27758): shared `propMissingSlots` helper — page sweep + block button + (semantically) per-field menu now agree: stored default-locale text, else authored schema default, else skip. PM read diff (PropField.default is non-optional string — safe), re-ran tsc clean + 2305/2305. NOTE: this consciously reverses T3's module-doc rationale ("translating defaults freezes them into the page") — parity across the three translate paths won over that concern, per user request; the freeze tradeoff is inherent to default-sourced translation everywhere. bt-parity closed. Parked item cleared.

## Retro

**Q1 — worker corrections?** None. T9 shipped complete on first pass, including the ≥1000-LOC decomposition unprompted (the rule hardened after the previous feature is doing its job).

**Q2 — user/scope corrections after brief approval?** None post-approval. The feature itself was a post-delivery parity ask from the sibling feature — that question-class lesson (bulk actions at N levels of one surface → ask about every level of the PARALLEL surface) is recorded in pm-process.md.

**Q3 — process creaks?** PM browser QA caught what review/tests couldn't: the AI-assistant launcher covering the panel's last control (T10). Lesson added to pm-process.md: browser QA must exercise the LAST control of any scrollable panel a feature appends to. Also: one page-level translate run hit a model-stall timeout mid-QA (infra flake; error path surfaced correctly; re-run resumes) — no action, matches the 45s-idle design.

**Final QA (PM, browser):** ITEM TEXT section renders for unbound translatable props only (bookLabel unbound vs name/location/… mapped); translate-to-all filled {fi, ro-ro, es} on the template block; saved; preview with bb_content_locale=fi rendered "Varaa pöytä" on exactly the configured List's 3 rows, all other lists fell back to EN defaults; per-locale values byte-checked via DOM read.

**Parked:** pageTranslateEntries does NOT source from a template prop's authored schema default when nothing is stored (per-field/T8 block button do) — so a never-edited template prop isn't planned by the page-level sweep until its default-locale text is stored once. Parity gap, small; candidate follow-up.
