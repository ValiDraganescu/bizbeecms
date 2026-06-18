# Deploy architecture & runbook — current state (authoritative)

> **Future agents: read THIS before investigating deploy.** It is the current, verified map of
> how PM, the deployer, and per-Site CMS Workers relate, the exact env-var / secret status, and
> the ordered procedure to deploy. It exists so you don't re-run a blind multi-file search.
> Last verified **2026-06-18** against the live account via `wrangler whoami` / `secret list` /
> `deployments list`.
>
> Supersedes the old `DEPLOY.md` (deleted). The CMS deploy path is now **PM → deployer Worker →
> Sandbox Container running `wrangler deploy`** — wrangler handles Durable Objects and static
> assets natively, so the old in-PM Script-Upload blockers (DO-strip, assets-404) **no longer
> apply** and are not repeated here.

---

## The actors

```
                         ┌──────────────────────────────────────────────────────────┐
                         │  Cloudflare account  f510a16043d1521697b8974165f9c78d     │
                         │  (vali.draganescu88@gmail.com — OAuth, workers/d1/kv write)│
                         └──────────────────────────────────────────────────────────┘

  ┌─────────────────────────┐         POST /deploy                ┌──────────────────────────┐
  │  ProjectManager (PM)    │   Bearer DEPLOYER_SECRET            │  deployer Worker         │
  │  Worker — DEPLOYED ✅   │   body {siteId, slug}               │  + Sandbox Container     │
  │                         │ ──────────────────────────────────▶│  DEPLOYED ✅ (2026-06-17)│
  │  bizbeecms-             │                                     │  bizbeecms-deployer      │
  │  projectmanager         │◀────────────────────────────────── │                          │
  │  .vali-draganescu88     │   POST /api/deploy-callback         │  runs in-container:      │
  │  .workers.dev           │   (status back to PM)               │   git clone REPO_URL     │
  │                         │                                     │   npm ci                 │
  │  bindings:              │                                     │   opennextjs-cf build    │
  │   DB   (D1 bizbeecms)   │                                     │   wrangler deploy …      │
  │   SESSIONS (KV)         │                                     └────────────┬─────────────┘
  │   ASSETS                │                                                  │ wrangler deploy
  │  vars:                  │                                                  │  --name bizbeecms-cms-<slug>
  │   APP_ORIGIN            │                                                  │  --var SITE_ID/PM_ORIGIN/
  │   DEPLOYER_URL ────────▶ points at the deployer Worker                     │       CMS_AUTH_SECRET
  └─────────────────────────┘                                                  ▼
            ▲                                                     ┌──────────────────────────┐
            │  POST /api/auth/cms-validate                        │  per-Site CMS Worker     │
            │  Bearer CMS_AUTH_SECRET                              │  bizbeecms-cms-<slug>    │
            │  + forwarded bizbee_session cookie + {siteId}        │  NONE DEPLOYED YET       │
            │  → {ok, userId}                                      │                          │
            └──────────────────────────────────────────────────── │  bindings (per-Site):    │
              (CMS requireAdmin guard calls PM to authorize        │   DB    (per-Site D1) ❌ │
               every /admin/* + /api/* admin request)              │   MEDIA (R2 bucket)   ❌ │
                                                                   │   AI    (Workers AI)     │
                                                                   │  vars (← deployer --var):│
                                                                   │   SITE_ID                │
                                                                   │   PM_ORIGIN              │
                                                                   │   CMS_AUTH_SECRET        │
                                                                   └──────────────────────────┘
```

## Deploy flow (the real path — container, not Script-Upload)

1. PM user clicks **Deploy** on a Site → `ProjectManager/src/app/api/sites/[id]/deploy/route.ts`
   authorizes (`canManageSiteByCountry || isUserAssignedToSite`), latches Site `status=deploying`,
   POSTs `{siteId, slug}` to `${DEPLOYER_URL}/deploy` with `Bearer DEPLOYER_SECRET`.
2. The **deployer Worker** (`deployer/src/index.ts`) writes a parameterized bash script into its
   **Sandbox Container** and starts it detached; the Worker returns immediately.
3. In-container: `git clone REPO_URL` → `npm ci` → `opennextjs-cloudflare build` over `CMS/` →
   `npx wrangler deploy --name bizbeecms-cms-<slug> --var SITE_ID:… --var PM_ORIGIN:… --var CMS_AUTH_SECRET:…`
   (`deployer/src/index.ts:191-194`). **wrangler deploys natively** → DOs + `.open-next/assets`
   handled correctly.
4. Deployer POSTs status back to PM at `${PM_CALLBACK_ORIGIN}/api/deploy-callback`; PM sets
   Site `status=deployed` (+ `worker_name`) or `failed`.
5. Once live, every CMS admin request runs `requireAdmin` → CMS forwards the `bizbee_session`
   cookie + `{siteId: env.SITE_ID}` + `Bearer CMS_AUTH_SECRET` to PM's `/api/auth/cms-validate`,
   which resolves the PM session and runs PM's site-reach check. **Any PM user with access to the
   Site is a CMS admin.** (See `pm-cms-auth-decision` memory + `HITL.md` Done P0.)

## Custom customer domains (Cloudflare for SaaS) — added 2026-06-18

Lets a customer point their own domain (e.g. `restovista.com`) at a deployed Site
**without** adding that domain to our CF account. Custom hostnames bind to the
`bizbeecms.com` **zone**, not to a Worker, so a single router Worker fans out to the
right per-Site CMS Worker by `Host`.

```
  customer.com  (CNAME → cf.bizbeecms.com, + TXT for DV cert)
     │
     ▼  CF for SaaS custom hostname (cert auto-issued/renewed) → zone bizbeecms.com
  ┌──────────────────────────┐   HOST_MAP KV    ┌──────────────────────────┐
  │  bizbeecms-router        │  host → slug     │  bizbeecms-cms-<slug>    │
  │  DEPLOYED ✅             │ ───lookup──────▶ │  (per-Site CMS Worker)   │
  │  route cf.bizbeecms.com/*│   then fetch →   │  .workers.dev URL        │
  └──────────────────────────┘                  └──────────────────────────┘
```

- **Router** (`router/src/index.ts`): reads `Host`, looks up the slug in `HOST_MAP`
  KV, proxies to `https://bizbeecms-cms-<slug>.<WORKERS_SUBDOMAIN>.workers.dev`
  (preserving path/query, forwarding original host as `x-forwarded-host`). Proxies by
  `.workers.dev` URL rather than service binding — Sites are created at runtime, so a
  static binding can't exist for them.
- **Attach** (`deployer/src/index.ts` `POST /attach-domain`, Bearer `DEPLOYER_SECRET`,
  body `{slug, hostname}`): registers the custom hostname via the CF
  `zones/<CF_ZONE_ID>/custom_hostnames` API (`ssl: txt/dv`), writes `hostname → slug`
  to `HOST_MAP` KV, returns the DNS records the customer must add (`cname` →
  `cf.bizbeecms.com`, `txt` for DV). Idempotent (reuses existing on CF error 1406).
- **Fallback origin**: `cf.bizbeecms.com` — dummy proxied A record (`192.0.2.1`) in the
  bizbeecms.com zone; set as the CF for SaaS Fallback Origin.
- **Apex caveat**: customer apex domains can't always CNAME — registrar needs CNAME
  flattening, else an A record to CF's anycast IPs. PM UI should show both.

### Status (2026-06-18)
- ✅ `bizbeecms-router` deployed (route `cf.bizbeecms.com/*`); `HOST_MAP` KV created
  (`1c276b01cd5a41f0b8c98ace07b4c064`), bound to both router and deployer.
- ✅ `cf.bizbeecms.com` dummy proxied A record added in the bizbeecms.com zone (the
  old project's dead `bizbeecms.com`/`www` → `195.201.28.111` records are stale and
  can be deleted/repointed — apex is reserved for a future PM/marketing site);
  `CF_ZONE_ID` secret set on deployer; deployer redeployed with `/attach-domain`.
- ❌ **`CF_API_TOKEN` needs ZONE-scoped perms for custom hostnames** — the token is
  currently all `Account`-scoped. custom_hostnames is a **Zone** resource, so add
  **`Zone · SSL and Certificates · Edit`** + **`Zone · Zone · Read`** with a Zone
  Resources include for `bizbeecms.com`. (`Account · SSL and Certificates · Edit` does
  NOT cover it.) `/attach-domain` fails the call until this is added.
- ❌ **Fallback Origin not yet set** in the CF dashboard (SSL/TLS → Custom Hostnames →
  Fallback Origin = `cf.bizbeecms.com`).
- ❌ End-to-end untested — also needs a live `bizbeecms-cms-<slug>` Worker (none booted
  yet) for the router proxy target to exist.
- ⚠️ To catch customer **apex** domains the router route must widen from
  `cf.bizbeecms.com/*` to `*/*` (zone bizbeecms.com). Note the `*.bizbeecms.com`
  wildcard DNS record would then be shadowed by that route.

## Env-var / secret status (verified live 2026-06-18)

| Where | Name | Purpose | Status |
|---|---|---|---|
| **PM Worker** ✅ deployed | `DB` (D1 `bizbeecms`, id `69cda498…`) | PM data (users/sites) | ✅ provisioned + migrated |
| PM | `SESSIONS` (KV, id `f400b577…`) | session records keyed `session:<id>` | ✅ provisioned |
| PM | `ASSETS` | PM static assets | ✅ live |
| PM | `APP_ORIGIN` (var) | invite/accept link origin (Host-injection guard) | ✅ `https://bizbeecms-projectmanager…workers.dev` |
| PM | `DEPLOYER_URL` (var) | where PM POSTs Site deploys | ✅ `https://bizbeecms-deployer.vali-draganescu88.workers.dev` |
| PM | `DEPLOYER_SECRET` (secret) | bearer PM→deployer | ✅ set |
| PM | `CMS_AUTH_SECRET` (secret) | bearer PM's `/api/auth/cms-validate` checks incoming CMS requests against | ✅ **set 2026-06-18** (= deployer's value) |
| PM | `CF_API_TOKEN`, `CF_ACCOUNT_ID` (secrets) | legacy Script-Upload path | ⚠️ set but unused by the container path |
| **deployer Worker** ✅ deployed (2026-06-17) | `CF_API_TOKEN` (secret) | Workers Scripts/KV/R2: Edit — deploys the CMS Worker; **+ Zone · SSL and Certificates · Edit + Zone · Zone · Read** (zone bizbeecms.com) for `/attach-domain` custom_hostnames | ⚠️ set, but **zone-scoped perms not yet added** (token is all Account-scoped) |
| deployer | `CF_ZONE_ID` (secret) | bizbeecms.com zone id (`dfaec5f7…`) — custom_hostnames target | ✅ **set 2026-06-18** |
| deployer | `HOST_MAP` (KV `1c276b01…`) | host → slug map written by `/attach-domain` | ✅ provisioned + bound |
| deployer | `CF_ACCOUNT_ID` (secret) | account owning CMS Workers (`f510a160…`) | ✅ set |
| deployer | `DEPLOYER_SECRET` (secret) | bearer it requires from PM | ✅ set (= PM's value) |
| deployer | `REPO_URL` (secret) | https clone URL of this repo | ✅ set |
| deployer | `GITHUB_TOKEN` (secret) | PAT to clone (if repo private) | ✅ set |
| deployer | `PM_CALLBACK_ORIGIN` (secret) | PM origin for status callback **+ fallback for PM_ORIGIN** | ✅ set |
| deployer | `CMS_AUTH_SECRET` (secret) | passed to each CMS via `--var`; **without it CMS auth fails closed → every admin route 401s** | ✅ **set 2026-06-18** (= PM's value) |
| deployer | `PM_ORIGIN` (secret) | where CMS calls `/api/auth/cms-validate` | ✅ resolved — code falls back to `PM_CALLBACK_ORIGIN` (`deployer/src/index.ts:123`), so no separate set needed |
| **CMS Worker** (per-Site) | `SITE_ID` / `PM_ORIGIN` / `CMS_AUTH_SECRET` (vars) | injected by deployer `--var` at deploy | auto on deploy (empty placeholders in `CMS/wrangler.jsonc`) |
| CMS | `DB` (per-Site D1) | the Site's content | ❌ **NOT auto-created** — manual (see below) |
| CMS | `MEDIA` (R2 bucket) | media library | ❌ **NOT auto-created** — manual |
| CMS | `AI` (Workers AI) + AI Gateway `bizbeecms-cms` | chat / AI tools | ❌ gateway is a manual dashboard step; binding works once it exists |
| **router Worker** ✅ deployed (2026-06-18) | `HOST_MAP` (KV `1c276b01…`) | host → slug lookup | ✅ bound |
| router | `WORKERS_SUBDOMAIN` (var) | builds the per-Site `.workers.dev` proxy target (`vali-draganescu88`) | ✅ set |

Legend: ✅ verified live · ❌ not provisioned / not automated · ⚠️ caveat. **All control-plane secrets
are now set — the only open items are per-Site/account infra (D1, R2, AI Gateway) and verification.**

---

## Part A — Deploy PM itself (already done; re-run after PM changes)

Runs inside **`ProjectManager/`** (its own npm package, not a workspace).

```bash
cd ProjectManager
npm run bundle:cms     # regenerate the committed CMS bundle if CMS/ changed (see note ‡)
npm run deploy         # = (predeploy: preflight) → opennextjs-cloudflare build && deploy
```

- `predeploy`→`preflight` (`scripts/preflight-deploy.mjs`) is an npm pre-script that **aborts** the
  deploy if `wrangler.jsonc` still has placeholder zero-ids, missing `nodejs_compat` /
  `global_fetch_strictly_public` flags, or a missing/short/structurally-broken CMS bundle.
- **NEVER run the OpenNext build while `next dev` is on 3601/3602** — it corrupts `.next` and 500s
  the server. `lsof -ti:3601 -ti:3602`; if a `next-server` is there, kill it + `rm -rf .next .open-next`.
- Confirm: `npx wrangler deployments list` · `curl -sS https://bizbeecms-projectmanager.vali-draganescu88.workers.dev/api/health`.

‡ **CMS bundle note:** PM's preflight requires `src/lib/deploy/cms-bundle.generated.js`, a committed
pre-bundled CMS artifact. It is a leftover gate from the **old** Script-Upload path — the live CMS
deploy now goes through the deployer Container (which builds CMS fresh from a git clone), so the
committed bundle is **not what gets deployed**. Keep regenerating it (`npm run bundle:cms`) only to
keep preflight green; it does not affect the container deploy.

## Part B — First-run bootstrap (in the deployed PM)

1. Open the PM URL. With an empty `users` table, `/register` is **open**.
2. Register the **first** user → becomes **SuperAdmin** (invite rights). After this `/register`
   self-closes; further users come via the invite flow (scope Admins/SiteManagers by country).

## Part C — Provision per-Site / account infra (NOT automated — manual, with CF auth)

The deployer only builds + `wrangler deploy`s the CMS Worker; it does **not** create infra. Before
(or as part of) a CMS deploy:

- **AI Gateway** `bizbeecms-cms` — dashboard → AI → AI Gateway; enable **Workers AI**. Once, shared
  across Sites. (Override per-Site with the `AI_GATEWAY` var if you use a different slug.)
- **per-Site D1**: `wrangler d1 create bizbeecms-cms-<slug>` → `wrangler d1 migrations apply …`
  (CMS migrations under `CMS/migrations/`, incl. `0002_*` asset table).
- **per-Site R2 bucket**: `wrangler r2 bucket create bizbeecms-cms-media` (or per-Site), bound `MEDIA`.
- The CMS `wrangler.jsonc` `DB`/`MEDIA` ids are placeholders → the deploy step must override them
  per-Site (same `--var`/binding-override mechanism), OR pre-create and reference real ids.

## Part D — Trigger a CMS deploy & verify (the open HITL P1)

1. In PM: create a **Site** (Sites → New) → its detail page → **Deploy**. Worker name `bizbeecms-cms-<slug>`.
2. Watch status latch `deploying` → `deployed` (+ `worker_name`) on the deployer callback, or `failed`.
3. Verify boot + auth (this round-trip has **never run live yet**):
   ```bash
   npx wrangler deployments list --name bizbeecms-cms-<slug>
   curl -i  https://bizbeecms-cms-<slug>.<subdomain>.workers.dev/api/pages      # signed-out → expect 401 (auth guard)
   curl -sS https://bizbeecms-cms-<slug>.<subdomain>.workers.dev/               # public page → 200 (needs a published `home` slug, else 404 by design)
   ```
   Then sign in to PM as a user **with** access to the Site, forward the `bizbee_session` cookie to a
   CMS admin route → expect **200**; a PM user **without** access → **401** / forbidden page.

---

## Verified vs unverified (be honest in reports)

- ✅ **PM deployed & running** — 2026-06-18, version `a555b3d7-1f87-46e6-90ca-46188833d361`.
- ✅ **deployer deployed** — 2026-06-17, all 6 base secrets + `CMS_AUTH_SECRET` set.
- ✅ **Sec1 control plane complete**: `CMS_AUTH_SECRET` matches on PM + deployer; `PM_ORIGIN` resolves
  via `PM_CALLBACK_ORIGIN` fallback; deployer injects all 3 vars (`deployer/src/index.ts:191-194`);
  PM `/api/auth/cms-validate` + CMS `guard-core.ts`/`guard.ts` built and unit-tested.
- ❌ **No per-Site infra provisioned** (D1 / R2 / AI Gateway) and **no CMS Worker booted yet** — the
  CMS→PM auth round-trip and all live CMS features are unverified. This is the open `HITL.md` P1.

## Pointers (don't re-derive these)

- PM→deployer trigger: `ProjectManager/src/app/api/sites/[id]/deploy/route.ts`
- deployer + container + `wrangler deploy` command: `deployer/src/index.ts` (`:191-194`; var fallbacks `:117-123`)
- deployer required secrets: `deployer/wrangler.jsonc:26-32` (comment block)
- CMS auth bridge: `ProjectManager/src/app/api/auth/cms-validate/route.ts` ←→ `CMS/src/lib/auth/guard-core.ts` + `guard.ts`
- CMS per-Site vars declared empty: `CMS/wrangler.jsonc` (`SITE_ID`/`PM_ORIGIN`/`CMS_AUTH_SECRET`)
- Auth decision rationale: memory `pm-cms-auth-decision`; deploy mechanism: memory `pm-cms-deploy-via-container`
- Custom domains: router `router/src/index.ts`; attach endpoint `deployer/src/index.ts` (`/attach-domain`, `attachDomain()`); fallback origin `cf.bizbeecms.com`; `HOST_MAP` KV `1c276b01cd5a41f0b8c98ace07b4c064`
- Live HITL items to verify post-deploy: `HITL.md`
```
