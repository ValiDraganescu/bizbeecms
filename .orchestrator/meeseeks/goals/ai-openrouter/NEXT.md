# Note to the next Meeseeks (ai-openrouter)

This goal is now **code-complete end to end**: OpenRouter adapter + getAi() selection +
catalog swap + translate unify + per-Site key + key-minting + CMS-local override +
deploy fallback warnings + price display + tool-call filter + modality icons +
**in-use key credit display (this run)**. BACKLOG has **no open TODO left**.

### DONE this run (2026-06-24)
- **Show remaining credit/spend for the in-use minted/env key.** Pure
  `CMS/src/lib/chat/credit.ts` (`parseKeyCredit` of OpenRouter's per-KEY
  `/api/v1/key` → `{usage,limit,remaining}`; `formatUsd`). New `GET /api/chat/credit`
  returns `{credit:null}` when a CMS-local USER key is in use or no key (mirrors
  `effectiveOpenrouterKey` precedence), else the env/minted key's credit. Widget
  footer line "$X of $Y left" / "$X used", hidden when null. i18n EN/FI/ET.
  `credit.test.mjs` 8/8; full CMS suite 831/831; build GREEN.

### Pick next — there's no queued task, so INVENT the next valuable slice
The goal stands; some candidates if nothing new is reported:
1. **Periodic/refresh credit** — currently fetched once on panel open. If a long
   session needs live spend, re-fetch after each completed turn (busy→idle edge,
   like the history-save effect) — but YAGNI unless asked.
2. **Surface credit in PM too** (per-Site minted key spend on the Site detail page)
   — would need a PM-side `/api/v1/key` call with the decrypted key; bigger, may be
   its own slice. Flag the curator if it grows into a track.
3. Re-confirm the whole AI provider story at the deploy gate (offline) if anything
   upstream changed.
All the live OpenRouter calls (chat stream, mint/delete, `/api/v1/key` credit) are
HITL — see root `HITL.md`.

## Reminders (still true)
- `CMS/src/lib/ports/ai.ts` imports MUST be RELATIVE `.ts` (not `@/`) — `.mjs` tests import it directly.
- Credit uses per-KEY `/api/v1/key`, NOT account-wide `/api/v1/credits` (mgmt key). NEVER log the key.
- `effectiveOpenrouterKey(userKey, envKey)` is the precedence helper — reuse it, don't re-derive.
- `.toFixed(2)` is binary-float (7.555→"7.55"); don't assert half-up rounding in tests.
- CONCURRENT ai-widget-ux Meeseeks shares `messages/*.json` + `chat-widget.tsx`.
- CMS test glob: `node --test scripts/*.test.mjs 'src/**/*.test.ts'`.
- Dev OFF before any build gate (`lsof -ti :3601 :3602`). Build corrupts `.next`.
- Catalog/widget are bundled modules → NO cms-bundle regen needed.
