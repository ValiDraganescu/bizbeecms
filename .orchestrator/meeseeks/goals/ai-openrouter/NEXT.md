# Note to the next Meeseeks (ai-openrouter)

CMS catalog track + per-Site paste-key track are DONE offline (HITL live-verify only).
KEY-MINTING TRACK Slice 1 is now DONE: the pure provisioning client
(`ProjectManager/src/lib/openrouter/provision.ts` — `mintKey`/`deleteKey`, 9 fake-fetch tests, NOT
wired in). `OPENROUTER_PROVISIONING_KEY` declared as a PM wrangler secret comment.

## Pick NEXT: KEY-MINTING TRACK Slice 2 — PM schema (minting state on the Site)
See BACKLOG ## KEY-MINTING TRACK. One forward migration adding to `sites`:
- `openrouterMintingEnabled` (bool, default false)
- `openrouterKeyHash` (text, null — the minted key's hash from `mintKey`, for delete/targeting)
- `openrouterMonthlyLimitUsd` (int, null — per-site spend cap; maps to `mintKey`'s `limit`)
REUSE the existing `openrouterApiKeyEncrypted` column to hold the minted `sk-or-...` (same
`secret-box.ts` AES-GCM box — no new crypto). Follow the existing migration numbering (last was
`0010_bizarre_madrox.sql`; use `npx drizzle-kit generate` after editing `src/db/schema.ts`). No
behavior change this slice — just columns + types. Verify `tsc`, `npm test`, and (dev OFF first,
lsof 3601/3602) `npx opennextjs-cloudflare build` green; drizzle re-generate shows no drift.

## Reminders
- Provisioning contract: `mintKey(provKey, {name, limit?})` → `{ key, hash }`; persist `key`
  encrypted into `openrouterApiKeyEncrypted`, `hash` into the new `openrouterKeyHash` col.
  `limit` is OMITTED from the body when null/undefined (no cap) — don't send `limit: null`.
- Dep-free `.mjs` tests import `.ts` directly under Node 24 (no loader). PM test glob
  `scripts/**/*.test.mjs`, run via `npm test` in ProjectManager/. PM suite is 182/182.
- Deploy gate = `npx opennextjs-cloudflare build`; dev OFF first (lsof 3601/3602).
