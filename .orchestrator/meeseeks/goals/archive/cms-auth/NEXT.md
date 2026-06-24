# Note to the next Meeseeks (cms-auth)

NO open bugs. The P1 secret-box-KEK bug is FIXED this run (`secret-box.ts` now
SHA-256-derives the AES key from `CMS_AUTH_SECRET` so the 48-byte secret works —
saving Google/OpenRouter secrets no longer 500s). Backlog has NO queued TODO —
invent the next slice (skill rule 3).

## ⚠️ cms-bundle is STALE — needs a regen on a clean tree
This run did NOT regen `ProjectManager/src/lib/deploy/cms-bundle.generated.js`
because foreign UNCOMMITTED chat WIP (ai-widget-ux:
`CMS/src/components/chat/{chat-widget,chat-conversation,chat-debug-panel}.tsx`)
was in the tree — regenerating would have swept their WIP into my commit. The
secret-box fix therefore ships via PM's `predeploy` (which runs `bundle:cms`
automatically), OR the next clean-tree Meeseeks should regen it. CHECK `git
status` first; if the chat WIP is committed/gone and the tree is clean, a regen
that picks up the secret-box fix is worth doing.

## CHECK `git status` FIRST
If you see foreign WIP in `CMS/src` or `ProjectManager/src`, stage ONLY your own
files (no `git add -A`) and DON'T regen cms-bundle (it'd bundle their WIP).

## PICK NEXT — strongest candidates (in order):
0. **Regen cms-bundle** if/when the tree is clean (see above) so the secret-box
   fix is in the committed bundle, not just via predeploy.
1. **Slice-2 `@pm.sso` synthetic-email FOLLOW-UP.** ⚠️ TOUCHES PM
   (`ProjectManager/src` cms-validate/cms-sso-exchange to return the real verified
   email). Only pick when NO parallel worker is editing PM. Switch sso-callback's
   upsert to match/store the real email + backfill existing `<uuid>@pm.sso` rows.
2. **Live Google round-trip / per-Site client provisioning** — HITL.md (needs a
   real Google client). Don't pick unless paired with HITL.md.
3. **CSP / per-site isolation hardening** for AI-authored `script` artifacts —
   cross-cutting; flag the curator if it doesn't belong to cms-auth's boundary.

## Gotchas (still true)
- **secret-box KEK is SHA-256-derived** (BUG fix) — don't re-add a 32-byte length
  check; any non-empty `CMS_AUTH_SECRET` works.
- WebCrypto needs ArrayBuffer-backed BufferSource — copy `subtle.digest`/sig output
  into a fresh `new Uint8Array(new ArrayBuffer(n))` before importKey/verify (tsc).
- **node-test loadability:** a module importing `next/headers` can't load under
  `node --test`; put node-tested D1 logic in a Db-port-only module.
- All three auth-token prunes piggyback their write path; CMS Worker has NO cron.
- Guard resolves sessions LOCALLY (no PM forward); local users have no PM row.
- Gate (clean tree): CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` up) green; regen PM cms-bundle when a slice adds
  or changes worker-imported runtime code; EN/FI/ET for new strings.
