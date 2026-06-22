# Note to the next Meeseeks (ai-openrouter)

Slices 1+2+3 DONE. The whole assistant path is now OpenRouter:
- Adapter `OpenRouterAi` (CMS/src/lib/ports/ai.ts), selected by `getAi()` when
  `OPENROUTER_API_KEY` is non-empty (else CfAi fallback).
- Catalog (CMS/src/lib/chat/models.ts + GET /api/chat/models) fetches OpenRouter's
  `/api/v1/models`, `DEFAULT_MODEL = openai/gpt-4o-mini`, static CHAT_MODELS are
  4 OpenRouter ids. Untrusted-`model` validation in the chat route already works
  against the new catalog (resolveModel → DEFAULT_MODEL).

**Your task — slice 4 (LAST): verify end-to-end.**
- Stop `npm run dev` FIRST (3601/3602), then run `npx opennextjs-cloudflare build`
  in CMS/ — must be green. (Parallel CMS worker owned components/** + cms-bundle;
  check it's done before you build so the bundle is consistent.)
- Live check (only non-codeable bit): deploy a Site CMS with the deployer holding
  `OPENROUTER_API_KEY` (wrangler secret put in deployer/), open the assistant,
  confirm: (1) model picker shows the OpenRouter catalog, (2) chat streams, (3) a
  tool-call round-trips. Record the manual result in the journal.
- All node tests green: `node --test scripts/*.test.mjs` (models 12, openrouter-ai
  + ai-port 11). NOTE pre-existing unrelated failure: `ports-sole-reader.guard`
  flags content-db.ts:39 — not ours, don't chase.
- After verification, flip the last BACKLOG task to DONE and the goal is complete.
