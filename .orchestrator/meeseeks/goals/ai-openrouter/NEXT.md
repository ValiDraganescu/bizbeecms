# Note to the next Meeseeks (ai-openrouter)

**This goal is code-complete.** OpenRouter-adapter migration + key-minting +
CMS-local override + translate unified, all built/tested/build-gated. As of
2026-06-23 BOTH deploy-time fallback paths are SURFACED to the PM operator
(non-blocking warning Alerts in the deploy form, EN/FI/ET) instead of the old
silent warn+fallback: `mintWarning` (mint-on-deploy failed) and `keyWarning`
(a stored per-Site key couldn't be decrypted). Both are pure response flags;
the graceful-degrade-to-global-key behavior is unchanged.

- PM suite 197/197, CMS suite 777/777.
- PM `npx opennextjs-cloudflare build` GREEN (dev off first).
- BACKLOG has NO open TODO. All remaining work is HITL (root `HITL.md`, P1):
  live mint/delete/precedence + live OpenRouter chat & translate calls + now
  also seeing the `mintWarning` fire against a real failed mint — all need a
  real `OPENROUTER_PROVISIONING_KEY` on PM + a real key on the CMS.

## If summoned anyway, DON'T idle — pick a worthwhile slice toward main:
- **Per-isolate cache of the CMS-local key read in `getAi()`** if chat latency
  ever matters (currently one D1 lookup per request — YAGNI flagged in caveats).
- ~~Same visibility treatment for the per-Site DECRYPT failure path~~ DONE
  2026-06-23 (`keyWarning`). Both deploy-fallback paths now surface to the operator.
- Otherwise re-read `main/GOAL.md` and find the next valuable slice; this goal's
  surface is essentially EXHAUSTED — every codeable item is shipped; remaining
  work is the HITL live checks in root `HITL.md`. Consider helping another goal.

## Reminders (still true)
- `CMS/src/lib/ports/ai.ts` imports MUST be RELATIVE `.ts` (not `@/`) — `.mjs`
  tests import it directly under Node type-stripping; `@/` ERR_MODULE_NOT_FOUNDs.
- `getAi()` reads the CMS-local key in try/catch→null; chat must NEVER 500 on it.
- Mint-on-deploy must NEVER crash the deploy — the new `mintWarning` is purely a
  response flag; the catch+warn+global-fallback path is unchanged.
- The translate-route regression bans any `@cf/` literal in that route source.
- CMS test glob: `node --test scripts/*.test.mjs 'src/**/*.test.ts'` (777 now).
- PM test glob: `node --test 'src/lib/**/*.test.ts' 'scripts/**/*.test.mjs'` (192).
- Dev OFF before any build gate (`lsof -ti :3601 :3602`). Build corrupts `.next`.
