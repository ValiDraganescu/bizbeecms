# Goal: main — bizbeecms

bizbeecms is a multi-site **B2B whitelabel CMS**, fully **Cloudflare-native** (only Cloudflare services). It has two major components:

- **ProjectManager (PM)** — a Next.js app where users manage other users, create Sites, and deploy them.
- **CMS** — a Next.js app (initially the default Next.js install in `CMS/`) that gets deployed per-Site to Cloudflare.

## Milestone 1 — ProjectManager + bootstrap CMS deploy ✅ DONE (verified live 2026-06-17)

PM is deployed on Cloudflare and can trigger a real per-Site CMS Worker deploy end-to-end. User mgmt (SuperAdmin/Admin/SiteManager, country scope), invite flow, Site CRUD, and the deploy pipeline all work. The deploy runs `opennextjs build && wrangler deploy` inside a Cloudflare **Container** (the `bizbeecms-deployer` Worker), with stuck-deploy detection + cancel/restart. PM + CMS UI localized EN/FI/ET. M1's capability spec is preserved below for reference.

## Milestone 2 — the AI-assistant CMS as the product (CURRENT)

The CMS is **no longer "just the default Next.js install"** — it is the product. Each per-Site CMS embeds an **AI assistant** that builds the site: creates content, **authors custom UI components**, composes pages from them, and translates — all from a chat.

**Settled architecture (verified this session — runs on Cloudflare Workers, no migration off CF):**
- The AI emits a component artifact **`{ tree, script, css }`**, NOT JSX source to eval.
  - `tree` — a JSON/YAML element tree the Worker renders to HTML **server-side** via `React.createElement` (a data walk, NOT `eval`/`Function` — those are permanently blocked on Workers).
  - `script` — AI-authored client JS shipped to the browser as a `<script>` string; the Worker forwards it as data, the **browser** executes it. This is how custom *interactive* components work without server eval.
  - `css` — Tailwind classes resolve against a **precompiled utility sheet** (the build-time scanner can't see runtime artifact classes); rare custom values use inline `style`. Per-site theme via DB-backed CSS-var overrides.
- Security boundary moved server→browser: never interpolate end-user data into `script`; per-site isolation + (later) CSP.
- Proof: `CMS/src/app/test/page.tsx` — JSON-tree SSR + token Tailwind + client-script increment, live on a deployed CMS Worker.
- See memory `pm-ai-assistant-runtime-decision` for the full reasoning trail.

**Reference (`../aicms`) — mine these solved features (Postgres→D1, keep R2):** hierarchical pages (slugs, publish status, per-locale SEO, redirects, templates, nav menus), section/block trees + custom components, per-Site **content locales** (data-driven, distinct from admin UI), AI translate tool, R2 asset gallery (upload + CDN serve), and site settings (brand identity, design system, AI persona, theme).

---

## Milestone 1 capability spec (reference)

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
