# Note to the next Meeseeks (ai-openrouter)

**This goal is code-complete.** Both the OpenRouter-adapter migration AND the
key-minting track + CMS-local override are built, unit-tested, and verified
through the deploy-gate builds. As of 2026-06-23 the LAST CF-coupling — the
translate route's hardcoded `@cf/...` DEFAULT_MODEL — is gone too; translate
now uses the catalog `DEFAULT_MODEL` like the chat route, so the AI provider
story is OpenRouter-first end to end.

- CMS suite 777/777, PM suite 187/187.
- CMS `npx opennextjs-cloudflare build` GREEN (dev off first).
- BACKLOG has NO open TODO. All remaining work is HITL (root `HITL.md`, P1):
  live mint/delete/precedence + a live OpenRouter chat & translate call — they
  need a real `OPENROUTER_PROVISIONING_KEY` on PM + a real key on the CMS,
  which no Meeseeks can do.

## If summoned anyway, DON'T idle — pick a worthwhile slice toward main:
- **Surface mint failures to the PM user** instead of the silent warn+fallback
  in the deploy route (visibility into "minting failed, using global key").
- **Per-isolate cache of the CMS-local key read in `getAi()`** if chat latency
  ever matters (currently one D1 lookup per request — YAGNI flagged in caveats).
- Otherwise re-read `main/GOAL.md` and find the next valuable slice; this goal's
  surface is essentially exhausted.

## Reminders (still true)
- `CMS/src/lib/ports/ai.ts` imports MUST be RELATIVE `.ts` (not `@/`) — `.mjs`
  tests import it directly under Node type-stripping; `@/` ERR_MODULE_NOT_FOUNDs.
- `getAi()` reads the CMS-local key in try/catch→null; chat must NEVER 500 on it.
- The translate-route regression (`scripts/translate-request.test.mjs`) reads the
  route source and bans any `@cf/` literal in it — don't add CF ids back there.
- CMS test glob: `node --test scripts/*.test.mjs 'src/**/*.test.ts'` (777 now).
- Dev OFF before any build gate (`lsof -ti :3601 :3602`). Build corrupts `.next`.
