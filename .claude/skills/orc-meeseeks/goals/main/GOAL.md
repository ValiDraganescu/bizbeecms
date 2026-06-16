# Goal: main — bizbeecms

bizbeecms is a multi-site **B2B whitelabel CMS**, fully **Cloudflare-native** (only Cloudflare services). It has two major components:

- **ProjectManager (PM)** — a Next.js app where users manage other users, create Sites, and deploy them.
- **CMS** — a Next.js app (initially the default Next.js install in `CMS/`) that gets deployed per-Site to Cloudflare.

## This milestone

Ship the **ProjectManager** with three working capabilities:

1. **User management** with roles:
   - **SuperAdmin** — the first user that registers (email + password). Can do everything.
   - **Admin** — invited by SuperAdmins or Admins-with-invite-rights. Can be scoped by country. Can invite others.
   - **SiteManager** — invited by SuperAdmins or Admins, assigned to existing Sites. Can create and manage Sites. Can be scoped by country.
2. **Site creation** — a Site is a project; one or more PM users can work on the same Site.
3. **Site deployment** — a Site is a deployment of the CMS to Cloudflare. **The deployment process must work from Cloudflare after the ProjectManager itself is deployed** (i.e. PM running on Cloudflare can trigger a CMS deploy via Cloudflare APIs).

**Localization:** The PM UI must be localized in **English, Finnish, and Estonian**. The CMS UI must support the same three locales, and **additionally** allow configuring an arbitrary set of **user-facing content languages per Site** (content locales are data-driven and distinct from the fixed admin-UI locale set).

The CMS, for now, is just the default Next.js installation in a `CMS/` directory. Deployment must actually spin up a CMS instance on Cloudflare.

## Stack (north star — confirmed with user)

- **PM app**: Next.js deployed to **Cloudflare Workers** (OpenNext / `@opennextjs-cloudflare`).
- **Data**: **Cloudflare D1** (SQLite).
- **Auth**: email + password, sessions in D1/KV.
- **Site deploy**: PM calls the **Cloudflare API** to create/run a new Worker per Site running the CMS.
- KV / R2 as needed.

## Reference

`../aicms` is an existing CMS implementation — reuse its solved tricks for AI Agents and server-side component generation/rendering. Mine it for patterns; do not blindly copy.

## What "good" looks like for this milestone

- SuperAdmin bootstrap (first registration) works; subsequent registrations don't silently become SuperAdmin.
- Invite flow with role + country scoping enforced server-side.
- Sites are CRUD-able and assignable to PM users.
- Triggering a deploy from the deployed PM provisions a real CMS Worker on Cloudflare and reports status back.
- Cloudflare-only: no non-Cloudflare infra dependencies.
