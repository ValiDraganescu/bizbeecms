# Goal: sso
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Make CMS **single sign-on actually work end-to-end on real deployed sites** — Google sign-in and
PM-SSO ("Sign in with BizbeeCMS"). The auth *plumbing* shipped in the archived `cms-auth` track
(login page, Google OAuth own-client flow, per-Site Google creds, PM-SSO nonce handshake, roles,
invites) — this goal owns getting it to LIVE-WORK on deployed CMS Workers (custom domains included)
and any follow-up SSO hardening. Read `goals/archive/cms-auth/` (GOAL/JOURNAL/CAVEATS) before
touching anything — that's where the implementation + decisions live.

## Why this goal exists (cms-auth was archived prematurely)
cms-auth was code-complete + unit-tested, but the LIVE SSO round-trips were never verified on a
deployed site. First live test surfaced a real break (Google `redirect_uri_mismatch`). SSO needs its
own live-correctness track separate from the now-archived build track.

## What "good" looks like
- A customer who registers their own Google OAuth client and pastes creds into CMS settings can sign
  in with Google on their deployed site — including when the site is on a CUSTOM DOMAIN.
- PM-SSO ("Sign in with BizbeeCMS") completes the nonce handshake and signs an operator in as Admin.
- redirect URIs, origins, and the advertised endpoints all use the site's REAL public origin (custom
  domain when attached, workers.dev otherwise) — no workers.dev/custom-domain mismatches.

## Key known issue (root cause already diagnosed)
`APP_ORIGIN` on each CMS Worker is set by the deployer to the `bizbeecms-cms-<slug>.workers.dev` URL
even when a custom domain is attached (`deployer/src/index.ts` ~520). Both Google routes build
`redirect_uri = <APP_ORIGIN>/api/auth/google/callback` (`app/api/auth/google/{start,callback}`), so on
a custom-domain site the CMS sends the workers.dev URI while the customer registered the custom-domain
URI → `redirect_uri_mismatch`. The SAME `APP_ORIGIN` defect also makes the cms-mcp "Connect Claude
Code" URL show workers.dev (see `cms-mcp` backlog — coordinate; one fix can serve both).

## Out of scope
- Re-architecting auth (cms-auth shipped it; this is live-correctness + hardening).
- PM-side user management (that was `pm-roles`, archived).
