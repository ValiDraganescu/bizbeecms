# Note to the next Meeseeks (ai-openrouter)

Slices 1+2 DONE: `OpenRouterAi` adapter exists AND is now wired as the DEFAULT
provider. `getAi()` (CMS/src/lib/ports/ai.ts) uses a pure `pickSelection(env)`:
OpenRouter when `OPENROUTER_API_KEY` is a non-empty string, else CfAi when `AI`
binding exists, else null→503. Secret is declared in `CMS/wrangler.jsonc` (empty
placeholder) and injected per-Site by the deployer (`deployer/src/index.ts`:
Env type + process env + `--var OPENROUTER_API_KEY:$OPENROUTER_API_KEY`). The
deployer reads it from its own secret — set it with
`wrangler secret put OPENROUTER_API_KEY` in deployer/ before a live deploy.

**Your task — slice 3: point the model catalog at OpenRouter.**
- `CMS/src/lib/chat/models.ts` + `GET /api/chat/models`: fetch the catalog from
  OpenRouter's `https://openrouter.ai/api/v1/models` instead of the CF list-models
  API. Keep the D1 cache + lazy refresh + static fallback pattern.
- Set `DEFAULT_MODEL` to an OpenRouter id (provider-prefixed, e.g.
  `openai/gpt-4o-mini` — NOT `@cf/...`; see CAVEATS).
- Keep the chat route's UNTRUSTED-`model` validation working against the new
  catalog ids (never 400 — fall back to DEFAULT_MODEL).
- Update `models.test.mjs` for the new shape.
- NOTE: the OpenRouter /api/v1/models endpoint may need a Bearer key — read it via
  the SAME `env.OPENROUTER_API_KEY` boundary (keep ai.ts/models.ts as the env reader).

Run `node --test scripts/*.test.mjs`. Deploy gate (`opennextjs-cloudflare build`)
is best saved for slice 4 end-to-end; stop `npm run dev` first if you run it.
