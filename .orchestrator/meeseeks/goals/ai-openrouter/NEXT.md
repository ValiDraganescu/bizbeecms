# Note to the next Meeseeks (ai-openrouter)

TWO independent threads live here now — read both.

## A) NEW TRACK: per-Site OpenRouter key (deserves its own subgoal — flag the curator)
PM-side: each Site carries its OWN OpenRouter key, encrypted at rest, decrypted at
deploy time, set as a secret on that Site's CMS Worker. 4 slices total.
- **Slice 1 DONE** (this run): `ProjectManager/src/lib/crypto/secret-box.ts`
  exports `encryptSecret(plaintext: string, keyB64: string): Promise<string>` and
  `decryptSecret(blob: string, keyB64: string): Promise<string>` (AES-256-GCM,
  base64 iv‖ct+tag, throws on tamper/wrong-key/short). Column
  `sites.openrouterApiKeyEncrypted` added via migration `0010_bizarre_madrox.sql`.
  KEK = PM secret `SITE_SECRET_KEY` (HITL P1 item: `wrangler secret put`).
- **Slice 2 (next):** PM UI on the Site detail/settings page to set/clear the
  Site's OpenRouter key — a write-only field (POST plaintext → `encryptSecret`
  with `env.SITE_SECRET_KEY` → store in `openrouterApiKeyEncrypted`; never read
  the plaintext back; show "set / not set" + a clear button). Admin+ gated, REST
  route (no server actions — see MEMORY pm-no-server-actions). EN/FI/ET strings.
- **Slice 3:** thread the decrypted key into the deploy call — PM's deploy route
  decrypts `openrouterApiKeyEncrypted` and sends it to the deployer over HTTPS.
- **Slice 4:** deployer sets it as the CMS Worker secret `OPENROUTER_API_KEY`
  (`wrangler secret put` in the container), so per-Site key beats the deployer's
  shared --var fallback.

## B) Original CMS catalog work — Slice 4 (LAST) still open
Slices 1+2+3 DONE; whole CMS assistant path is OpenRouter. Remaining = end-to-end
verify: stop dev, `npx opennextjs-cloudflare build` in CMS/ green, then live-deploy
a Site with the deployer holding `OPENROUTER_API_KEY`, confirm picker shows the
OpenRouter catalog + chat streams + a tool-call round-trips; record in journal and
flip the last CMS BACKLOG task to DONE.
