# Note to the next Meeseeks (ai-openrouter)

KEY-MINTING Slices 1 (provision client), 2 (PM schema), 3 (Edit Site UI) are DONE.
The Edit Site form now shows minting controls (toggle + monthly USD limit + a
DISABLED "Delete current key" stub) instead of a key paste field. PATCH persists
`openrouterMintingEnabled` + `openrouterMonthlyLimitUsd`; the key is never
user-entered. Provision client = `ProjectManager/src/lib/openrouter/provision.ts`
(`mintKey`/`deleteKey`, fake-fetch tested).

## Pick NEXT: KEY-MINTING Slice 5 — PM mint-on-deploy (idempotent) + DELETE endpoint
See BACKLOG ## KEY-MINTING TRACK ("PM mint-on-deploy (idempotent) + delete endpoint").
In the PM deploy route (`src/app/api/sites/[id]/deploy/route.ts`), BEFORE building
the deployer POST:
- If `site.openrouterMintingEnabled` AND `site.openrouterKeyHash == null` (no key yet):
  `mintKey(env.OPENROUTER_PROVISIONING_KEY, { name: site.slug, limit: site.openrouterMonthlyLimitUsd ?? undefined })`,
  encrypt the returned `sk-or-...` into `openrouterApiKeyEncrypted` (via
  `setSiteOpenrouterKey` — already kept for this), store the `hash` in `openrouterKeyHash`.
- If `openrouterKeyHash != null` → DO NOT mint again (idempotent).
- Mint failure MUST NOT crash deploy — catch, warn, proceed with the global fallback
  (same graceful-degrade as the decrypt path). The existing Slice-3 decrypt-and-thread
  path (`decideDeployOpenrouterField`) stays — it now carries the minted key.
- Add `DELETE /api/sites/[id]/openrouter-key`: `deleteKey(provKey, hash)` then null out
  `openrouterKeyHash` + `openrouterApiKeyEncrypted` (proceed-and-clear even on remote 404).
  Then WIRE the Edit-form "Delete current key" button (currently disabled) to it.
- Pure decision helper (mint? / skip? from enabled+hash) with a dep-free `.mjs` test.
- `OPENROUTER_PROVISIONING_KEY` needs `wrangler secret put` on PM before a live mint (HITL).

## Reminders
- `OPENROUTER_PROVISIONING_KEY` is the SINGLE PM secret (NOT per-site); comment in PM wrangler.jsonc.
- `mintKey` OMITS `limit` when null/undefined (no `limit: null`) — pass `?? undefined`.
- Migrations: edit `src/db/schema.ts` THEN `npx drizzle-kit generate`. Last = 0012.
- Dev OFF before the build gate (lsof 3601/3602). Gate = `npx opennextjs-cloudflare build`.
- PM suite is 183/183 via `npm test` (globs `src/lib/**/*.test.ts` + `scripts/**/*.test.mjs`).
- PM is REST-only (no server actions), server-renders Site pages — never leak the key to the client.
- No Switch component in PM — use a styled native `<input type=checkbox>`.
