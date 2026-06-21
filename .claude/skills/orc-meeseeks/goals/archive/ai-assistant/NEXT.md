# Note to the next Meeseeks (ai-assistant)

DONE this run: **Searchable model picker over the FULL Workers-AI catalog** (the big backlog
TODO, now closed). Replaced the 3-id `<select>` with: pure catalog helpers in
`lib/chat/models.ts` (parseModelCatalog/groupByProvider/sortByPrice/filterCatalog/providerOf;
`resolveModel` takes an optional dynamic allowlist), a D1 cache reusing the generic
`site_settings` table (`model_catalog` row, NO new table), `GET /api/chat/models` (admin-only,
cache + lazy-refresh >12h via CF list-models API, static fallback when CF creds absent), and an
in-house combobox `components/chat/model-picker.tsx` (search + provider groups + price + kbd nav).
i18n modelSearch/modelNoResults EN/FI/ET. models.test 11/11; tsc + opennext green; cms-bundle regen.

PICK NEXT (re-rank toward the GOAL — page-aware assistant that builds the site):
  1. **CF_ACCOUNT_ID / CF_API_TOKEN provisioning for the live catalog** — the catalog API
     fetch only works once the deployer injects these two vars per-Site (NOT in wrangler.jsonc
     yet). Without them the picker silently serves the 3-model static fallback. This is a
     binding-adapters / deployer coordination task: add the two vars to the deploy --var set
     (same creds the REST `Ai` task uses) + declare placeholders in wrangler.jsonc vars. Until
     then the picker works but only shows the static list on deployed CMSes. Flag to the driver
     if it belongs in binding-adapters.
  2. **Tool-result UX in the transcript** — round-tripping emits several `tool` events
     interleaved with text per multi-round turn; check `chat-conversation.tsx` renders the
     sequence readably (tool cards between assistant text). Likely small client polish.
  3. **Component-target translation** — `/api/translate` 422s `kind:"component"` BY DESIGN
     (component copy lives in block props at the page use-site). A real DESIGN task — decompose
     before starting; may deserve its own backlog slice / a flag to the driver. Don't half-build.

WATCH OUT (read CAVEATS — esp. the new MODEL CATALOG block):
  - Grouping is vendor-from-id (`@cf/<vendor>/`), not a real provider field (the API has none).
  - Cache = generic `site_settings` `model_catalog` row, no migration. Lazy refresh on read.
  - Live fetch needs env.CF_ACCOUNT_ID + env.CF_API_TOKEN (deployer-injected, absent locally →
    static fallback). CF list-models returns `@cf/...` only; multi-provider gateway models are
    not API-exposed (curated supplement is the only path, not built).
  - `resolveModel(value, allowedSet?)` — pass the cached catalog ids so new ids validate; keep
    the untrusted→known→default guard. Combobox is in-house; do NOT add a combobox dep.
  - Always gate: CMS tsc + opennext build (a stray `aicms` dev server on :3501 is fine — it's a
    DIFFERENT repo; only stop a *bizbeecms* `next dev` before building). Regen PM cms-bundle from
    **ProjectManager/** (root has no package.json). The selfcheck static-assets-gap warning is
    pre-existing, not yours.
  - Known failing test `page-blocks-sections.test.ts` is a PAGE-BUILDER bug, NOT this goal.
