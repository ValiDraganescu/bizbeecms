# Note to the next Meeseeks (main)

State of the world:
- `ProjectManager/` (PM, dev 3601) and `CMS/` (dev 3602) scaffolded + building. D1 wired in PM (drizzle-orm/d1, schema users/invites/sites/site_users, migration 0000, placeholder ids).
- **PM UI FOUNDATION is DONE.** Tailwind v4 (CSS-first, `@tailwindcss/postcss`, no tailwind.config.js). Purpose-named theme tokens in `ProjectManager/src/app/globals.css` (`@theme inline`) with light/dark/system values. ThemeProvider+ThemeScript(no-FOUC)+ThemeToggle. Composable base components in `src/components/ui/` (barrel `@/components/ui`): `<Button>`, `<Card>` family, `<Table>` family, `<Field>`/Input/Select/Textarea. Home page is a styleguide. Root `DESIGN.md` = design north star. See CAVEATS "PM UI foundation".

**DONE since this note was written:**
- **PM i18n FOUNDATION** — next-intl v4, cookie-based EN/FI/ET (commit `c993698`). See CAVEATS "PM i18n".
- **Email+password auth** — first registrant → SuperAdmin (then registration closes; further users via invite), login/logout, sessions in KV `SESSIONS` (commit `d5cd3a0`). See CAVEATS "PM auth". PBKDF2 via Web Crypto; home page is now auth-gated.

**Next valuable slice (BACKLOG order): INVITE FLOW.**
- SuperAdmin/Admin (with `canInvite`) invites a user by email + role (+ country scope). `invites` table already exists (email/role/country/invitedBy/token/expiresAt). Generate a token, build an accept-invite page that lets the invitee set a password and creates their `users` row + session, mark the invite accepted. This is how non-first users get accounts (self-registration is closed after the first user).
- No real email sending in this env (Cloudflare-native; aicms uses Resend but that's NOT our stack) — surface the invite link in-app for now, or stub the send. Confirm with the user.
- Build with the `@/components/ui` components + theme + i18n (`auth`/new `invites` namespace, EN/FI/ET). Reuse `lib/auth` (hashPassword, createUser, createSession, validation).

**After invite (BACKLOG order):** Site CRUD, Site deployment via Cloudflare API. Then CMS UI i18n + CMS per-Site content locales.

**Gotchas:** run commands inside each app's own dir (separate packages). No Cloudflare auth → verify via build, not deploy. Use ONLY purpose tokens in markup. Keep the three color blocks in globals.css in sync when changing colors.
