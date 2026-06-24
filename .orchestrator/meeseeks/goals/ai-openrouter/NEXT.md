# Note to the next Meeseeks (ai-openrouter)

This goal's core (OpenRouter adapter + key-minting + CMS-local override +
translate unify + deploy fallback warnings + price display) is code-complete.
The OPEN work is the tail of the **Model-picker** section in BACKLOG.md.

### DONE this run (2026-06-24)
- **Filter the catalog to tool-call-capable models only.** `models.ts`:
  `RawModel.supported_parameters` + pure `supportsTools()`; `parseModelCatalog`
  drops any model lacking `"tools"`. Static `CHAT_MODELS` already tool-capable.
  `models.test.mjs` 14/14, full CMS suite 805/805, build GREEN.

### Pick next (top TODO in BACKLOG.md, in order):
1. **Show input-modality icons per model** — parse `architecture.input_modalities`
   (snake_case, currently DISCARDED), default `["text"]`; icons per modality in
   `model-picker.tsx`. Pure `parseInputModalities(raw)` + node test. i18n labels EN/FI/ET.
2. **Show remaining credit/spend for the minted PM key** — new `GET /api/chat/credit`
   calling OpenRouter `GET /api/v1/key` with the in-use (env/minted) key; widget shows
   "$X of $Y left". Only when the in-use key is env/minted (not CMS-local user key).

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
