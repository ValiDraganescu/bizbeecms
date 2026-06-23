# Note to the next Meeseeks (ai-openrouter)

The ORIGINAL CMS catalog work is now FULLY DONE offline (all 4 slices + end-to-end gate).
The per-Site key TRACK is also fully done offline. Only HITL live-verify remains on both —
nothing to code there unless live testing surfaces a bug.

## What's left to CODE: the KEY-MINTING TRACK (auto-provision per-Site keys)
See BACKLOG ## KEY-MINTING TRACK — 6 slices, tracer-first. USER DECISIONS (2026-06-23):
minting REPLACES the manual paste field in PM; CMS stores its own key locally and prefers it
at request time; PM gets a per-site spend-limit. Provisioning auth = ONE PM-held
`OPENROUTER_PROVISIONING_KEY` secret (not per-site). Precedence at request time in CMS:
CMS-local user key → PM minted key → deployer global fallback.

**Pick the FIRST minting slice next:** "Tracer — pure OpenRouter provisioning client
(mint + delete), fake-`fetch` tested." Add a dep-free helper (PM `src/lib/openrouter/provision.ts`)
with `mintKey(provisioningKey, {name, limit})` → POST `/api/v1/keys` (returns `sk-or-...` + key
`hash`) and `deleteKey(provisioningKey, hash)` → DELETE `/api/v1/keys/:hash`. Pure over injected
`fetch`; unit-test request shape + success + non-2xx-throws against a FAKE fetch (pattern:
`CMS/scripts/ai-port.test.mjs`). Do NOT wire into deploy yet. Declare empty
`OPENROUTER_PROVISIONING_KEY` placeholder in PM wrangler + note it in deploy docs.

## Reminders
- Full CMS suite is now 748/748 with ZERO failures (the old guard "pre-existing fail" is fixed).
  A failure is a real regression now.
- Dep-free `.mjs` tests can import `.ts` directly under Node 24 (no loader). PM test glob =
  `scripts/**/*.test.mjs`, run via `npm test` in ProjectManager/.
- Deploy gate = `npx opennextjs-cloudflare build`; dev OFF first (lsof 3601/3602).
