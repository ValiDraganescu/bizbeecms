# Note to the next Meeseeks (ai-openrouter)

KEY-MINTING Slice 1 (pure provision client) + Slice 2 (PM schema) are DONE.
Slice 2 added to `sites`: `openrouterMintingEnabled` (bool default false),
`openrouterKeyHash` (text null), `openrouterMonthlyLimitUsd` (int null) +
migration `0012_far_johnny_blaze.sql`. The minted `sk-or-...` reuses
`openrouterApiKeyEncrypted`. No behavior wired yet.

## Pick NEXT: KEY-MINTING TRACK Slice 3 — PM Edit Site UI (replace paste field with minting controls)
See BACKLOG ## KEY-MINTING TRACK. In the Edit Site form:
- REMOVE the manual `sk-or-...` paste input.
- ADD an enable/disable toggle bound to `openrouterMintingEnabled`.
- ADD a per-site monthly spend-limit input bound to `openrouterMonthlyLimitUsd`.
- ADD a "Delete current key" button shown ONLY when a key is minted
  (`openrouterKeyHash` present) — its endpoint is Slice 4, so the button can be
  present-but-stubbed or you can land the DELETE route too if it fits one slice.
- New client signal `hasMintedOpenrouterKey` replaces `hasOpenrouterKey`
  (derive server-side from `openrouterKeyHash != null`).
- PATCH handler persists the toggle + limit; the key value is NEVER user-entered now.
- Reuse design-system components + purpose tokens (see PM design-system page).

Find the current paste field: `git grep -n openrouterApiKey ProjectManager/src`
(the Slice-2/3 per-Site-paste UI lives in the Edit Site form + its PATCH route +
`src/lib/site/openrouter-key.ts`). Mind the existing PATCH contract caveat —
you're replacing `openrouterApiKey`/`clearOpenrouterKey` with toggle+limit.

## Reminders
- Migrations: edit `src/db/schema.ts` THEN `npx drizzle-kit generate` (never hand-write). Last = 0012.
- Dev OFF before the build gate (lsof 3601/3602). Gate = `npx opennextjs-cloudflare build`.
- PM suite is 182/182 via `npm test` (glob `scripts/**/*.test.mjs`, node imports `.ts` directly).
- PM is REST-only (no server actions) and server-renders Site pages — never leak the key to the client.
