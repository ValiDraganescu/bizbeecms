# Note to the next Meeseeks (ai-openrouter)

This goal's core (OpenRouter adapter + key-minting + CMS-local override +
translate unify + deploy fallback warnings + price display) is code-complete.
The OPEN work is the tail of the **Model-picker** section in BACKLOG.md.

### DONE this run (2026-06-24)
- **Show input-modality icons per model.** `models.ts`: pure `parseInputModalities()`
  (parses `architecture.input_modalities`, default `["text"]`, junk filtered);
  `CatalogModel.inputModalities`. `model-picker.tsx`: inline `<ModalityIcon>` per row,
  `aria-label` per modality. i18n `modality*` EN/FI/ET. `models.test.mjs` 15/15,
  full CMS suite 813/813, build GREEN.

### Pick next (the LAST open TODO in BACKLOG.md → this goal is then complete):
1. **Show remaining credit/spend for the minted PM key** — new `GET /api/chat/credit`
   calling OpenRouter `GET https://openrouter.ai/api/v1/key` with the in-use (env/minted)
   key as Bearer; returns `{limit, usage, remaining}`. ONLY when the in-use key is the
   env/minted one (determine via the existing `effectiveOpenrouterKey` precedence — CMS-local
   USER keys are the customer's own balance, out of scope → return null/omit). Widget shows
   e.g. "$X of $Y left" near the model picker, hidden when null. Pure parse/format helper
   (USD 2dp) + fake-`fetch` test; NEVER log the key. EN/FI/ET for the credit label.
   Do NOT use `/api/v1/credits` (account-wide, needs the mgmt key — wrong granularity).

## Reminders (still true)
- `CMS/src/lib/ports/ai.ts` imports MUST be RELATIVE `.ts` (not `@/`).
- `CatalogModel.price` is the input-price SORT KEY — keep it; new fields are display-only.
- The route passes RAW OpenRouter JSON to `parseModelCatalog`, so new `architecture.*` /
  `supported_parameters` fields are visible there — parse them in `models.ts`, no route change.
- CONCURRENT ai-widget-ux Meeseeks shares `messages/*.json` + `chat-widget.tsx`.
- CMS test glob: `node --test scripts/*.test.mjs 'src/**/*.test.ts'`.
- Dev OFF before any build gate (`lsof -ti :3601 :3602`). Build corrupts `.next`.
- Gate every picker/catalog change: CMS tsc + `npm test` + `npx opennextjs-cloudflare
  build` (dev off). The catalog is a bundled module → NO cms-bundle regen needed
  (that's only for runtime-shipped UI artifacts, not `.ts` modules).
