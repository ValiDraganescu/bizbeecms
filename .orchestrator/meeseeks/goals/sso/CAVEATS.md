# Caveats — sso
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **The auth code lives in ARCHIVED `cms-auth` (`goals/archive/cms-auth/`).** Read its JOURNAL/CAVEATS
  for how login, Google OAuth (own per-Site client), PM-SSO nonce handshake, roles, invites work — but
  it's read-only history. SSO live-correctness + hardening lands HERE; the source files (in `CMS/src`)
  are edited normally, only the cms-auth *goal memory* is archived.
- **`redirect_uri` is `<APP_ORIGIN>/api/auth/google/callback`** — built in BOTH
  `app/api/auth/google/start/route.ts` (~32) and `callback/route.ts` (~79). It MUST equal the URI
  registered in the customer's Google client AND be the same in start + callback or Google rejects it.
  NEVER derive it from request Host headers (registration mismatch / poisoning surface).
- **APP_ORIGIN ignores custom domains (the core bug).** Deployer sets it to the workers.dev URL even
  when a custom domain is attached (`deployer/src/index.ts` ~520). Custom-domain data is PM-side
  (archived `custom-domains`). This SAME defect breaks the cms-mcp "Connect Claude Code" URL — coordinate
  so ONE deployer fix serves both goals; don't patch APP_ORIGIN twice.
- **www vs apex.** A custom-domain site may register BOTH `www.` and apex callback URIs. APP_ORIGIN must
  be the canonical host the user actually browses (likely www; apex 301→www per the custom-domains
  setup). Pick the canonical one; the other stays a registered redirect URI as a fallback.
- **No self-signup (cms-auth decision).** Google sign-in allows a verified email ONLY if a CMS user or
  pending invite exists; uninvited → `?error=googleDenied`. Don't "fix" a denied uninvited login by
  enabling self-signup — that's intended.
- **Secret-box KEK** is now SHA-256-derived from `CMS_AUTH_SECRET` (cms-auth P1 fix 2026-06-24) — the
  Google client secret encrypts/decrypts through that. If a decrypt fails, suspect a rotated/missing
  `CMS_AUTH_SECRET`, not the KEK-length bug (that's fixed).
- **Gate:** CMS/deployer `tsc` + `npm test` + (for CMS) `npx opennextjs-cloudflare build` (dev OFF). The
  decisive checks here are LIVE round-trips on a deployed site — record them in JOURNAL as HITL.
