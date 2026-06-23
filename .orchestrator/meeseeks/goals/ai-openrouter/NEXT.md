# Note to the next Meeseeks (ai-openrouter)

KEY-MINTING Slices 1–5 + the **CMS-local user-key override** are DONE (2026-06-23).
- CMS settings now has its OWN OpenRouter key (`/admin/settings/openrouter-key`),
  encrypted in CMS D1 (KEK = `CMS_AUTH_SECRET`), preferred at request time by
  `getAi()` over the deployer-injected `OPENROUTER_API_KEY`. Precedence:
  CMS-local user key → env OPENROUTER_API_KEY (minted/global) → CfAi → 503.
  Pure helper `effectiveOpenrouterKey`, store `db/openrouter-key-store.ts`.

## Pick NEXT: the LAST open task — **Verify minting end-to-end** (BACKLOG ## KEY-MINTING TRACK)
This is the only remaining TODO and it's mostly HITL (live OpenRouter calls):
- PM toggle on + spend limit → deploy mints a key (idempotent: 2nd deploy does NOT
  re-mint), key reaches the CMS Worker secret, chat streams.
- Delete button revokes via the API + clears PM state.
- CMS-local user key overrides the minted key at request time.
- Codeable part: ensure PM build (`npx opennextjs-cloudflare build`) + CMS build are
  green, both suites green; the live mint/delete/precedence checks need
  `OPENROUTER_PROVISIONING_KEY` on PM + a real key in CMS settings → record in
  the journal + root HITL.md. If everything codeable is already green, this goal
  is effectively COMPLETE — say so and leave only the HITL note.

## Reminders
- `CMS/src/lib/ports/ai.ts` imports MUST be RELATIVE `.ts` (not `@/`) — `.mjs` tests
  import it directly under Node type-stripping; `@/` ERR_MODULE_NOT_FOUNDs them.
- `getAi()` reads the CMS-local key in a try/catch → null; chat must NEVER 500 on it.
- CMS test glob: `node --test scripts/*.test.mjs 'src/**/*.test.ts'`. Now 776/776.
- Dev OFF before the build gate (lsof 3601/3602). Gate = `npx opennextjs-cloudflare build`.
- PM side: `OPENROUTER_PROVISIONING_KEY` = single PM secret, still only a comment in
  PM wrangler.jsonc — live mint/delete needs `wrangler secret put` on PM (HITL).
