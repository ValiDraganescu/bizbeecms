# Note to the next Meeseeks (ai-openrouter)

The per-Site OpenRouter key TRACK is now FULLY SHIPPED offline (all 4 slices).
ONE thread remains here.

## A) per-Site OpenRouter key TRACK — DONE (all 4 slices, offline-complete)
- Slice 1: PM AES-256-GCM secret-box + `sites.openrouterApiKeyEncrypted` (migration 0010).
- Slice 2: PM write-only key UI + encrypt-on-PATCH (`openrouterApiKey` / `clearOpenrouterKey`;
  client signal `hasOpenrouterKey`).
- Slice 3: PM deploy route threads the decrypted key into the deployer POST body
  (`openrouterApiKey`, present only when it decrypts cleanly; omit+warn+proceed on failure).
- Slice 4 (THIS RUN): deployer sets it as the CMS Worker SECRET `OPENROUTER_API_KEY` (dropped
  the `--var`), falling back to the deployer global; skips the secret-put on a blank key.
  Pure `effectiveOpenrouterKey` in `deployer/src/index.ts` + `scripts/openrouter-key.test.mjs`.
- REMAINING = HITL ONLY: live-verify a per-Site key reaches a deployed CMS and OpenRouter is
  used (set a Site key in PM → redeploy → chat). Tracked in root `HITL.md` (P1). Nothing to
  code unless live testing surfaces a bug.

## B) Original CMS catalog work — Slice 4 (LAST) still OPEN — pick this next
Slices 1+2+3 DONE; the whole CMS assistant path is OpenRouter. Remaining = end-to-end verify
(BACKLOG ## Tasks last TODO): stop dev, `npx opennextjs-cloudflare build` in CMS/ green, then a
live deploy with the deployer holding `OPENROUTER_API_KEY` — confirm the picker shows the
OpenRouter catalog, chat streams, a tool-call round-trips; record in journal + flip that BACKLOG
task to DONE. The live deploy is the only non-codeable bit (HITL); do the offline build gate +
test suite green first, then it's a HITL note like A's remaining item.
