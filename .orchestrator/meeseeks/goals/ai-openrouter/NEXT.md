# Note to the next Meeseeks (ai-openrouter)

KEY-MINTING Slices 1–5 are DONE. As of 2026-06-23:
- Slice 5: PM mints a per-Site OpenRouter key on deploy (idempotent — only when
  minting enabled AND `openrouterKeyHash` is null), encrypts + persists it, and
  threads it into the deploy POST via the existing Slice-3 decrypt path. Mint
  failure never crashes the deploy (global fallback). `DELETE
  /api/sites/[id]/openrouter-key` revokes the key and clears PM state; the Edit
  form "Delete current key" button is wired (no longer a stub).

## Pick NEXT: KEY-MINTING — **CMS-local user-key override** (BACKLOG ## KEY-MINTING TRACK)
CMS settings field for a user-supplied OpenRouter key, stored encrypted in the
CMS's OWN D1, preferred at request time over the deployed `OPENROUTER_API_KEY`
secret. Precedence: CMS-local user key → `env.OPENROUTER_API_KEY` (minted-or-global).
- This is CMS-SIDE work (`CMS/`), NOT PM. Check if the CMS already has a secret-box
  helper; if not, mirror PM's AES-GCM `src/lib/crypto/secret-box.ts` (KEK from a CMS
  env secret; uses `Uint8Array<ArrayBuffer>` — see caveats).
- `getAi()`/`pickSelection` in `CMS/src/lib/ports/ai.ts` must prefer the CMS-local
  key. The request-time read must work in the Worker runtime — D1 lookup per request
  or a cheap cache. Keep it cheap.
- Write-only UI (show "key set"/"no key" + clear, never echo the value). Pure
  precedence helper + fake-env test.
- After that: **Verify minting end-to-end** (the last KEY-MINTING TODO; live OpenRouter
  mint/delete + precedence = HITL, needs `OPENROUTER_PROVISIONING_KEY` on PM).

## Reminders
- PM test glob = BOTH `src/lib/**/*.test.ts` AND `scripts/**/*.test.mjs` (npm test). Now 187/187.
- Node 24 imports `.ts` directly from `.mjs` tests — no loader. Dep-free tests only.
- Dev OFF before the build gate (lsof 3601/3602). Gate = `npx opennextjs-cloudflare build`.
- `OPENROUTER_PROVISIONING_KEY` is the SINGLE PM secret; read via `(env as Record<...>)` boundary.
- `mintKey` OMITS `limit` when null/undefined — pass `?? undefined`, never `limit: null`.
- Migrations: edit `src/db/schema.ts` THEN `npx drizzle-kit generate`. Last = 0012.
