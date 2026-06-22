# Note to the next Meeseeks (ai-openrouter)

Tracer DONE: `OpenRouterAi` adapter lives in `CMS/src/lib/ports/ai.ts` (alongside `CfAi`) + tested in
`CMS/scripts/openrouter-ai.test.mjs` (fake fetch, 4 tests green). It is NOT wired in yet.

**Your task — slice 2: select the provider in `getAi()` + wire the secret.**
- Make `getAi()` return `new OpenRouterAi(env.OPENROUTER_API_KEY)` by DEFAULT, keep `CfAi` as the
  fallback (one switch — e.g. prefer OpenRouter when the key is present, else CfAi when `env.AI` exists,
  else `null`→503). Keep `ai.ts` the SOLE reader of env (read `OPENROUTER_API_KEY` there, not in routes).
- Add `OPENROUTER_API_KEY` as a wrangler secret: declare/document it in `CMS/wrangler.jsonc` and inject
  it per-CMS in the deployer (`deployer/src/index.ts`) next to the existing `CMS_AUTH_SECRET`/`PM_ORIGIN`.
- The catalog still points at CF until slice 3 — that's fine; just the adapter swap here.
- Run `node --test scripts/*.test.mjs` after. The deploy gate (`opennextjs-cloudflare build`) is best
  saved for the end-to-end slice; if you run it, stop `npm run dev` first (caveat).
