# Goal: cms-auth
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Give each deployed per-Site **CMS** its own first-class authentication and member
management — so a client's own team can log into the CMS **directly** (email +
password), while bizbee operators still reach it via the existing PM SSO.

Today the CMS is **pure SSO with zero local users**: an unauthenticated visit to a
Site's CMS redirects straight to `manager.bizbeecms.com` and delegates every auth
decision to PM's `/api/auth/cms-validate` (the CMS D1 has NO user table). That's
wrong for the client's team members — they shouldn't be bounced to bizbee's
operator console. This goal makes the CMS authenticate its OWN users.

USER DIRECTIVE (2026-06-19): "When I go to a site deployment url, if I am not
logged in I am sent to the manager.bizbeecms.com to login via the SSO. But CMS
users (mostly the client's team members) could connect via a login page, so
instead of redirecting we should show a login page with email and password
authentication + a BizbeeCMS SSO button. But show the button only if I came to
that site from manager.bizbeecms.com (of course all the domains should not be
hardcoded, they should come from the config, we already have similar handling).
Then figure out user roles and invitation mechanism to be similar to the
ProjectManager (except the country scope)."

## What "good" looks like
- Visiting a deployed CMS URL while signed-out shows an **in-CMS login page**
  (email + password), NOT an automatic redirect to PM.
- That page shows a **"Sign in with BizbeeCMS" SSO button ONLY when the visitor
  arrived from `manager.bizbeecms.com`** (e.g. a `Referer`/explicit `?from=pm`
  hint). The PM SSO handoff (cms-sso → sso-callback) still works behind that
  button — operators keep their flow. The origin to match comes from **config**
  (reuse `PM_ORIGIN`), never hardcoded — same pattern as the existing
  `guard.ts`/`forwarded-host` host handling.
- The CMS has its **own user table + password auth** (mirror PM's: PBKDF2-100k
  hashing via `lib/auth/password.ts`, `bizbee_session`-style cookie + KV session,
  10-char min). First-user bootstrap rule TBD per slice (see BACKLOG).
- CMS **roles** mirror PM's role SET (the `pm-roles` subgoal:
  `SuperAdmin | Admin | Manager | Editor` + the removal hierarchy + `canRemoveUser`).
  Drop PM's country/tag SCOPE (that's PM-org structure; a single CMS = one Site).
  USER RULE 2026-06-21: **any PM user with access to the CMS's Site is an Admin in
  the CMS** — so the SSO/cms-validate path yields role=Admin; CMS-local users get a
  role from their invite. Authorization enforced server-side on `/admin/*` pages
  AND `/api/*` routes (the guard already gates both layers — extend it, don't fork).
- **Login page with THREE methods** (USER 2026-06-21): email + password, **Google
  account (OAuth 2.0, own client — NEW, no Google auth exists anywhere today)**, and
  the existing **SSO** ("Sign in with BizbeeCMS", conditional on PM origin per
  above). Google: register an OAuth client, handle redirect/callback in the CMS,
  match/create a CMS user by VERIFIED email; client id/secret from Worker
  vars/secrets (deployer-injected, never hardcoded).
- A **token-based invitation flow** mirroring PM: invite by email + role → emailed
  accept link → invitee sets a password (or links Google) and becomes a CMS user.
  7-day token TTL like PM. EMAIL via the **Cloudflare Email Service**
  (https://developers.cloudflare.com/email-service/ — the `send_email` binding;
  PM's binding is wired but commented in `wrangler.jsonc` — provision + use it).
  `APP_ORIGIN`-based accept URL.
- A **PM-SSO user auto-provisions** as a CMS user on first SSO login with
  role=Admin (so operators and invited client members coexist in one CMS user
  table), OR SSO stays a parallel path — settle this in the model slice (see
  CAVEATS). Given the "PM-with-site-access = Admin" rule, auto-provision-as-Admin
  is the natural default.
- Gate every slice: CMS `tsc` + `opennextjs-cloudflare build` green; regen the PM
  `cms-bundle` (the deployable CMS bundle PM ships); EN/FI/ET for all new strings.

## Settled identity model (Slice 0 — DECIDED 2026-06-22, build on this)

The central fork is resolved. All later slices (schema, login, roles, invites)
sit on these four decisions:

1. **ONE unified CMS user table; SSO login auto-provisions.** There is exactly
   one notion of a CMS user. A PM-SSO login UPSERTs a `users` row in the CMS D1
   (matched by verified email from cms-validate) with `role=Admin` (per the
   USER RULE "PM-with-site-access = Admin") and `passwordHash=NULL` (SSO-only,
   no local credential). Local email/password, Google, and invited users live in
   the same table. NO parallel "operator bypass" path — roles then apply
   uniformly to everyone.

2. **ONE session cookie on the CMS host, reusing the name `bizbee_session`.**
   The cookie name stays `bizbee_session` (it's `SESSION_COOKIE` in
   `guard-core.ts` and is already set by `/api/auth/sso-callback`). It is a
   DIFFERENT cookie from PM's (different host — `*.workers.dev` is on the Public
   Suffix List, so no cross-host sharing), so no real collision. Keeping the name
   means the existing guard's `readSessionCookie` and the SSO-callback set-cookie
   need no rename.

   **BUT the cookie's VALUE meaning changes (the key reconciliation):** today the
   SSO callback stores PM's *sid* in `bizbee_session` and the guard forwards that
   sid back to PM's cms-validate every request. Once the CMS has its own session
   store (Slice 1), the cookie must hold a **CMS-local session id**, not PM's sid.
   So Slice 1 + Slice 2 must change the SSO callback to: exchange the nonce → get
   PM userId/email → upsert the CMS user (role=Admin) → create a CMS-LOCAL session
   → set `bizbee_session` to the CMS session id. The guard then resolves the
   session LOCALLY (CMS session store) instead of forwarding to PM. cms-validate
   becomes the SSO *handshake* mechanism only (nonce exchange), no longer a
   per-request authorization call.

3. **First-user / bootstrap rule: NO local "first registrant = SuperAdmin".**
   Unlike PM, the CMS has no open self-registration. The first real CMS user is
   **the PM operator who first reaches the CMS via SSO**, auto-provisioned as
   `Admin` (decision 1). There is no `SuperAdmin` self-bootstrap on the CMS;
   `SuperAdmin` exists in the role SET for parity but is reserved/unused by
   default (an Admin can later be promoted via the user-mgmt UI in Slice 5 if we
   choose to expose it). Invited users get the role from their invite. An
   uninvited Google/email user with no matching row is REJECTED (no self-signup —
   randoms can't walk in).

4. **Role set mirrors pm-roles exactly:** `SuperAdmin | Admin | Manager | Editor`
   (+ the `canRemoveUser` removal hierarchy), country/tag SCOPE dropped. Confirmed
   against `ProjectManager/src/lib/roles.test.ts` (the 4-role union, no
   `SiteManager`). Slice 3 copies the NAMES + the removal helper, not the scope.

## Reference (PM is the blueprint — mirror it, drop country scope)
- PM roles/invites/auth live under `ProjectManager/src/`: `db/schema.ts`
  (`users`, `invites`, `invite_countries`, `site_users`), `lib/auth/password.ts`
  (PBKDF2 100k), `lib/auth/session.ts` (`bizbee_session` + KV), `lib/invite/*`
  (token, TTL, accept), `app/api/auth/{register,login}/route.ts`,
  `app/api/invite/**`. **Drop everything country-scoped** (`user_countries`,
  `invite_countries`, `canManageSiteByCountry`, the `COUNTRY_CODES` set).
- CMS auth seam to extend: `CMS/src/lib/auth/guard.ts` + `guard-core.ts` (the
  cms-validate forward), `CMS/src/app/admin/layout.tsx` (the redirect this goal
  replaces with a login page), `CMS/src/app/api/auth/*` (sso-callback lives here),
  `CMS/src/db/schema.ts` (add the user/invite/session tables here).
