# Handoff — Email+password auth (first registrant → SuperAdmin, sessions in KV)

**Date:** 2026-06-17
**Next session focus:** Build PM email+password auth — registration where the FIRST user becomes SuperAdmin (subsequent users do not), login, sessions in Cloudflare KV. All pages built with the existing components + theme + i18n; all copy localized EN/FI/ET.
**Project root:** /Users/valentindraganescu/git/dev/bizbeecms
**Branch:** `feat/pm-i18n` (based on `feat/design-system-and-combobox`)

## What we were doing
Building out the ProjectManager (PM) admin app for bizbeecms (Cloudflare-native multi-site B2B whitelabel CMS) in backlog order. Recent sessions completed: a `/design-system` component-reference page + a custom generic `Combobox`, and the **PM i18n foundation** (next-intl, EN/FI/ET). Auth is the next backlog item and was explicitly gated to come AFTER i18n (done) so every auth page is i18n-aware from the start.

## Current state
- **i18n is done and verified** but **NOT committed.** `next build` AND `opennextjs-cloudflare build` both pass; switched EN→FI live in-browser, persists across navigation; no console errors. See `git status` — modified: layout/page/design-system/theme-toggle/nav/next.config/CAVEATS; untracked: `ProjectManager/messages/`, `ProjectManager/src/i18n/`, `ProjectManager/src/components/i18n/`, `ProjectManager/src/app/not-found.tsx`.
- **Two uncommitted feature branches stacked:** `feat/design-system-and-combobox` (committed as `dc88d24`) → `feat/pm-i18n` (i18n work, uncommitted working tree on top). Neither pushed/merged. User has NOT yet been asked to commit i18n. Confirm with user whether to commit i18n (and on which branch) before/while starting auth.
- **DB schema for auth already exists** (`ProjectManager/src/db/schema.ts`): `users` table has `id`, `email` (unique), `passwordHash`, `role` (`SuperAdmin|Admin|SiteManager`), `country`, `canInvite`, `createdAt`. Migration `0000` already generated under `ProjectManager/migrations/`.
- **Bindings wired with placeholder ids:** `wrangler.jsonc` has D1 `DB` (`database_id` = all-zeros) and KV `SESSIONS` (`id` = all-zeros). Cannot create real resources or run `wrangler d1 migrations apply` / real deploy — no Cloudflare auth in this env. Verify via builds, not deploy.
- Do NOT trust a running `next dev` after structural changes — it serves stale chunks. `rm -rf .next` + restart (dev port 3601).

## Key decisions made this session
- **PM i18n is cookie-based (no proxy/middleware), NOT `/[locale]` path routing.** Next 16 made `proxy` Node-runtime-only; OpenNext-Cloudflare can't bundle a Node proxy, and Next 16 hard-rejects `runtime:"edge"` on a proxy. Path routing builds with `next build` but FAILS `opennextjs-cloudflare build` (the deploy gate). Cookie-based passes both. Reversible later — see header comment in `src/i18n/routing.ts`. (Refs: workers-sdk#13755, opennextjs-cloudflare#962.)
- Locale resolution order: `NEXT_LOCALE` cookie → `Accept-Language` → default `en`. Pages are now dynamically rendered (cookie read per request) — expected.
- All user-visible PM strings go through next-intl; catalogs in `ProjectManager/messages/{en,fi,et}.json`. Auth pages MUST add an `auth` namespace to all three.
- Earlier: custom `Combobox` is controlled-only, generic over T (default `{id,label,data}` or accessors); design tokens are OKLCH deep-indigo, purpose-named only.

## Open questions / blockers (for auth)
- **Password hashing on Workers:** bcrypt/argon2 native libs don't run on Workers. Use Web Crypto (PBKDF2 via `crypto.subtle`) or a pure-WASM/JS hash. Decide and confirm — this is the main implementation risk.
- **Session model in KV:** confirm shape (session id cookie → KV value with userId/expiry), cookie attributes (httpOnly, Secure, SameSite), TTL, and rotation/logout. KV binding is `SESSIONS`.
- **Cannot run real D1/KV** in this env — verify via `next build` + `opennextjs-cloudflare build` + reading generated SQL, not by executing queries.
- **"First registrant → SuperAdmin" race:** registration must atomically check whether any user exists and assign the role. D1 has no real concurrency here in practice, but design the check explicitly (count users; if 0 → SuperAdmin, else default role / invite-gated).
- Whether subsequent self-registration is even allowed, or if non-first users can ONLY arrive via the invite flow (next backlog item). README implies invite-gated; confirm.

## Pointers (read these first)
- **Backlog / plan (source of truth, NOT a PRD — kanban store is empty):** `.claude/skills/orc-meeseeks/goals/main/BACKLOG.md` and `.../NEXT.md` — auth is the next TODO after i18n.
- **CAVEATS (binding, read fully):** `.claude/skills/orc-meeseeks/goals/main/CAVEATS.md` — esp. the i18n entry, the D1/Drizzle + `getDb()` entry, KV `SESSIONS`, "verify via build not deploy", and UI/localization rules.
- **DB:** `ProjectManager/src/db/schema.ts` (users/invites/sites/site_users), `ProjectManager/src/db/index.ts` (`getDb()` → drizzle on `env.DB`). Migration workflow scripts in `package.json` (`db:generate`, `db:migrate`, `db:migrate:local`).
- **i18n architecture:** `ProjectManager/src/i18n/routing.ts` (locale source of truth + `/[locale]` migration checklist), `src/i18n/request.ts` (`resolveLocale()`), `src/components/i18n/locale-switcher.tsx`, `messages/{en,fi,et}.json`.
- **UI to build with:** `ProjectManager/src/components/ui/` (barrel `@/components/ui`) — `Button`, `Field`/`Input`/`Select`/`Textarea`, `Card`, `Table`, `Badge`, `Alert`, `Combobox`. Theme: `src/components/theme/`. Visual north star: root `DESIGN.md` ("Control Room").
- **Reference project for patterns (read-only, NOT infra):** `../aicms` — mine for AI-agent / server-render tricks only; it uses Postgres+Resend, not Cloudflare.
- **Recent commits:** `dc88d24` (design system + Combobox), `9c885bb` (UI foundation), `8559e63` (D1 schema). `git show <sha>` for detail.

## Suggested skills for the next session
- `/impeccable craft auth` (or `shape`) — build the register/login UI to the project's design bar; PRODUCT.md/DESIGN.md already exist so it won't re-run init. Use the existing `ui` components.
- `claude-api` — only if auth ends up touching Anthropic SDK (it shouldn't; skip otherwise).
- No `/orc-pm` needed — this is single-track work, not multi-agent.

## How to resume
1. Read `.claude/skills/orc-meeseeks/goals/main/CAVEATS.md` and `NEXT.md`, then `ProjectManager/src/db/schema.ts`.
2. Confirm with the user: (a) commit the i18n branch first? (b) password-hashing choice (recommend Web Crypto PBKDF2) and (c) session/cookie design.
3. Run `cd ProjectManager && rm -rf .next && npm run build` to confirm a green baseline before changing anything.
4. Build register + login routes/actions using `getDb()`, the `users` table, KV `SESSIONS` for sessions, the `@/components/ui` components, and a new localized `auth` namespace in all three `messages/*.json`. First-registrant-becomes-SuperAdmin logic in the register action.
5. Verify with `npm run build` + `npx opennextjs-cloudflare build` (no real deploy possible).

## What NOT to redo
- Don't reopen the i18n routing decision — cookie-based is deliberate and required for Workers deploy; `/[locale]` is documented as a future switch in `routing.ts`.
- Don't add a `tailwind.config.js` — Tailwind v4 is CSS-first; tokens live in `ProjectManager/src/app/globals.css` (`@theme inline`), purpose-named only.
- Don't re-scaffold the DB schema or change the `getDb()`/drizzle-d1 setup — `users` (with `passwordHash`/`role`/`canInvite`) and the bindings already exist.
- Don't try to `wrangler d1 create` / `kv namespace create` / real-deploy — no Cloudflare auth here; placeholder ids are intentional.
- Don't introduce non-Cloudflare infra (no Postgres, no external auth provider) — stack is Cloudflare-native by mandate.
- Don't hardcode user-visible strings — everything goes through next-intl (EN/FI/ET).
