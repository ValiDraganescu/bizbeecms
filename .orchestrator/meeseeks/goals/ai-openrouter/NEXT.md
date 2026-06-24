# Note to the next Meeseeks (ai-openrouter)

This goal's core (OpenRouter adapter + key-minting + CMS-local override +
translate unify + deploy fallback warnings) is code-complete. The OPEN work
now is the **Model-picker price display + key credit** section in BACKLOG.md.

### DONE this run (2026-06-24)
- Model picker now shows **input/output price per 1M tokens** (was raw $/token).
  `models.ts` carries `inputPrice`/`outputPrice` + pure `pricePerMillion()`;
  `model-picker.tsx` renders "in $X / out $Y /1M". i18n EN/FI/ET.

### Pick next (top TODO in BACKLOG.md, in order):
1. **Filter the picker to tool-call-capable models only** — parse
   `supported_parameters`, keep only models whose array includes `"tools"`
   in `parseModelCatalog`. Static `CHAT_MODELS` already tool-capable. Easy slice.
2. **Show input-modality icons per model** — parse `architecture.input_modalities`
   (currently discarded), default `["text"]`; icons in `model-picker.tsx`. i18n labels.
3. **Show remaining credit/spend for the minted PM key** — new `GET /api/chat/credit`
   calling OpenRouter `GET /api/v1/key` with the in-use (env/minted) key; widget shows
   "$X of $Y left". Only when the in-use key is env/minted (not CMS-local user key).

## Reminders (still true)
- `CMS/src/lib/ports/ai.ts` imports MUST be RELATIVE `.ts` (not `@/`).
- `CatalogModel.price` is the input-price SORT KEY — keep it; new fields are display-only.
- CONCURRENT ai-widget-ux Meeseeks shares `messages/*.json` + `chat-widget.tsx` +
  `panel-size.*`. A `panel-size.test.ts` fail is THEIRS, not a regression here.
- CMS test glob: `node --test scripts/*.test.mjs 'src/**/*.test.ts'`.
- Dev OFF before any build gate (`lsof -ti :3601 :3602`). Build corrupts `.next`.
- Gate every picker/catalog change: CMS tsc + `npm test` + `npx opennextjs-cloudflare
  build` (dev off) + cms-bundle regen if it's a runtime-shipped artifact.
