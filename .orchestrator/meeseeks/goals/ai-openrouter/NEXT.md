# Note to the next Meeseeks (ai-openrouter)

TWO independent threads live here — read both.

## A) per-Site OpenRouter key TRACK (deserves its own subgoal — flag the curator)
PM-side: each Site carries its OWN OpenRouter key, encrypted at rest, decrypted
at deploy time, set as a secret on that Site's CMS Worker. 4 slices total.
- **Slice 1 DONE:** `ProjectManager/src/lib/crypto/secret-box.ts`
  `encryptSecret`/`decryptSecret` (AES-256-GCM, KEK=`SITE_SECRET_KEY`); column
  `sites.openrouterApiKeyEncrypted` (migration 0010).
- **Slice 2 DONE:** PM write-only key UI + encrypt-on-PATCH.
  - **Request body (Site PATCH):** `openrouterApiKey` (plaintext set/replace,
    trimmed; blank = no change) and `clearOpenrouterKey: true` (only this wipes).
  - **Client "is set" signal:** `hasOpenrouterKey: boolean` (detail page derives
    it server-side from `openrouterApiKeyEncrypted != null`). Ciphertext/plaintext
    NEVER returned.
  - Pure parse: `src/lib/site/openrouter-key.ts#parseOpenrouterKey`.
    DB write: `src/lib/site/site.ts#setSiteOpenrouterKey(id, ciphertextOrNull)`.
- **Slice 3 (NEXT):** thread the decrypted key into the deploy call. PM's deploy
  route (`src/app/api/sites/[id]/deploy/route.ts`) loads the Site, and when
  `site.openrouterApiKeyEncrypted` is non-null, `decryptSecret(...,
  env.SITE_SECRET_KEY)` → send the plaintext to the DEPLOYER over the existing
  HTTPS call (it already passes CMS_AUTH_SECRET/PM_ORIGIN — add the per-Site
  OpenRouter key alongside, only when present). Decrypt failure must NOT crash a
  deploy (log + fall through to the deployer's shared `--var` fallback).
  Gate: PM tsc + npm test + opennext build (dev OFF first). Touch ProjectManager/
  + (for the wire) coordinate the deployer field name with Slice 4.
- **Slice 4:** deployer sets the received key as the CMS Worker secret
  `OPENROUTER_API_KEY` (`wrangler secret put` in the container), beating the
  deployer's shared `--var` fallback. Touch deployer/.

## B) Original CMS catalog work — Slice 4 (LAST) still open
Slices 1+2+3 DONE; whole CMS assistant path is OpenRouter. Remaining = end-to-end
verify: stop dev, `npx opennextjs-cloudflare build` in CMS/ green, then live-deploy
a Site with the deployer holding `OPENROUTER_API_KEY`, confirm picker shows the
OpenRouter catalog + chat streams + a tool-call round-trips; record in journal and
flip the last CMS BACKLOG task to DONE.
