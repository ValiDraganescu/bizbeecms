# Note to the next Meeseeks (cms-auth)

Slices 0, 1, 2, 3, AND 4 are DONE. Don't re-litigate the four Slice-0 decisions
(GOAL.md "Settled identity model").

## What Slice 4 left you (all green — 690 tests, tsc + opennext build)
- `invite` table + migration 0011 (deployer auto-applies per-Site).
- PURE `lib/invite/invite-core.ts` (token/TTL/`classifyInvite`) + CF
  `db/invite-store.ts` (create/find/checkInvite/`acceptInvite(token, passwordHash)`/
  hasPendingInvite/listPendingInvites). `acceptInvite` takes an ALREADY-HASHED
  password (pure/CF crypto split). Store fns + user-store `findUserByEmail`/
  `createUser` take an optional `injectedDb?: Db` for node tests (CAVEAT).
- `POST /api/invite` (checkAdmin → canInvite → canInviteRole) + `POST
  /api/invite/accept/[token]` (10-char min, hash, mint session). Public accept
  page `app/invite/accept/[token]/page.tsx` + `components/accept-invite-form.tsx`.
- `lib/mail/send-invite.ts` over the `send_email` Workers binding (degrades to
  logging; `APP_ORIGIN`-based link). Binding COMMENTED in wrangler (needs verified
  sender domain on Paid). Deployer injects `APP_ORIGIN`. EN/FI/ET: `inviteEmail` +
  `acceptInvite` namespaces. cms-bundle regenerated.

## PICK NEXT: Slice 5 (user-mgmt UI) OR Slice 2b (Google sign-in)
- **Slice 5 — CMS user management UI** is the natural continuation (it consumes the
  Slice 3 role gates + the Slice 4 invite API): an admin page gated by
  `canManageUsers` listing users (incl. the synthetic `<uuid>@pm.sso` SSO rows —
  CAVEAT) + pending invites (`listPendingInvites`), with invite-by-email + role
  select (reuse `POST /api/invite`), change-role (`canChangeRole`), and
  revoke-invite / remove-user (`canRemoveUser`). NEEDS the `roles` i18n namespace
  (role LABELS still untranslated — CAVEAT, deferred from Slice 3): add it mirroring
  PM `messages/*.json` `roles` block, then regen cms-bundle. Deletions = IN-APP
  confirm modal, NO native confirm (CAVEAT). You'll need a `DELETE`/`PATCH` user
  route + a revoke-invite route, both gated by `requireUserManager`/`canRemoveUser`.
- **Slice 2b — Google sign-in** is independent (OAuth 2.0 own client; see BACKLOG).

## Heads-up / gotchas
- CF Email binding uses the WORKERS shape `{to, from:{email,name}, subject, text}`
  — NOT PM's old `{from:string}` shape (CAVEAT). Binding commented until a verified
  sender domain exists; flow degrades to logging.
- Don't reintroduce the PM forward in the guard. Local/invited users have no PM row.
- Sole CMS worker; a PM worker may be in ProjectManager/src/. Only run bundle:cms
  from ProjectManager once a slice adds runtime code the worker serves.
- Gate every slice: CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` is up) + EN/FI/ET parity + regen cms-bundle.
