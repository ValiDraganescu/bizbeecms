# Deploy architecture & runbook — current state (authoritative)

> **Future agents: read THIS before investigating deploy.** It is the current, verified map of
> how PM, the deployer, and per-Site CMS Workers relate, the exact env-var / secret status, and
> the ordered procedure to deploy. It exists so you don't re-run a blind multi-file search.
> Last verified **2026-06-19** against the live account (custom-domain cutover + live SSO walk).
>
> Supersedes the old `DEPLOY.md` (deleted). The CMS deploy path is now **PM → deployer Worker →
> Sandbox Container running `wrangler deploy`** — wrangler handles Durable Objects and static
> assets natively, so the old in-PM Script-Upload blockers (DO-strip, assets-404) **no longer
> apply** and are not repeated here.

> ## ⚠️ CUSTOM-DOMAIN CUTOVER (2026-06-19) — read the traps section first
> PM, deployer, and sites moved OFF `*.vali-draganescu88.workers.dev` onto the `bizbeecms.com` zone:
> - **PM** → `https://manager.bizbeecms.com` (Worker custom domain)
> - **deployer** → `https://deployer.bizbeecms.com` (Worker custom domain)
> - **sites** → stay on `bizbeecms-cms-<slug>.vali-draganescu88.workers.dev` (option B — see traps #4)
> - **workers.dev is DISABLED on PM + deployer** (no `workers_dev` key in their wrangler.jsonc).
>   Their old `*.workers.dev` URLs now **404**. Anything still pointing at them breaks.
> See **"Traps we hit and what 100% does NOT work"** below before changing any hostname/origin.

---

## Traps we hit and what 100% does NOT work (custom-domain cutover, 2026-06-19)

Hard-won during the live cutover. Each cost real debugging — don't repeat them.

### 1. A stale `*.bizbeecms.com/*` zone Worker route shadows EVERY custom domain → blank edge 404
**Symptom:** PM deployed fine, `manager.bizbeecms.com` resolved (DNS → Worker, Proxied), but every path
(`/`, `/login`, `/api/*`, even `/favicon.ico`) returned an **empty-body 404** (`server: cloudflare`,
NO `cf-worker` header, `content-length: 0`) and `wrangler tail` logged **zero** invocations — requests
never entered the worker.
**Root cause:** a leftover Worker route `*.bizbeecms.com/*` → `bizbee-platform-dispatcher` (a dead
Workers-for-Platforms dispatch worker from an OLD, unrelated project — last modified 2025-06-17, NOT in
this repo). It caught `manager.*` first, tried `env.dispatcher.get('manager')`, failed, and returned a
blank 404. The account no longer even HAS Workers-for-Platforms (`dispatch/namespaces` API → "you do not
have access"), so its binding was dead and it 404'd everything it caught.
**Fix:** delete just that ROUTE (left the dead script): `DELETE /zones/<zid>/workers/routes/<route_id>`.
**How to diagnose fast:** `GET /zones/<zid>/workers/routes` (wrangler oauth token at
`~/Library/Preferences/.wrangler/config/default.toml`, value starts `cfoat_`). Account-scoped tokens can
read worker routes/scripts/domains but **NOT** zone SSL/DNS (those 401 — see trap #5).

### 2. ❌ DOES NOT WORK: bare `<slug>.bizbeecms.com` (one-level) per-site scheme
**Tried it, proven broken.** We deployed the router with a `*.bizbeecms.com/*` route to serve sites at
`<slug>.bizbeecms.com` (so the free `*.bizbeecms.com` universal cert would cover them). The instant it
deployed, `manager.bizbeecms.com/login` dropped **200 → 404** and `deployer` returned the router's
"Unknown domain". On THIS zone the wildcard **route beats the Worker custom domain** (Cloudflare docs
claim custom domains win — it did NOT hold here). A RESERVED-set guard in the router (`manager`/`deployer`/
`cf`/`www`) stopped mis-proxying but couldn't un-shadow them. **Reverted.** A one-level wildcard route
cannot coexist with one-level infra custom domains on the same zone. Do not retry this.

### 3. ❌ DOES NOT WORK (for free): two-level `<slug>.site.bizbeecms.com` without paid ACM
The `.site.*` namespace avoids the collision in #2, BUT the **free universal cert covers only ONE level**
(`*.bizbeecms.com`), not `*.site.bizbeecms.com`. Serving `<slug>.site.bizbeecms.com` live needs
**Advanced Certificate Manager** (~$10/mo) for a `*.site.bizbeecms.com` cert + a `*.site` proxied DNS
record. The router route `*.site.bizbeecms.com/*` is deployed but DORMANT (no DNS resolves to it). Code
is all in place to flip it on later.

### 6. ✅ Cloudflare-for-SaaS custom customer domains — the EXACT working recipe (verified live: www.restovista.com → test-1)
Pointing a customer's own domain (e.g. `www.restovista.com`, registered anywhere) at a Site is
CF-for-SaaS. It took several wrong turns; this is the verified-working setup. ALL of these are required:

1. **Attach the custom hostname** — PM custom-domain form → deployer `/attach-domain` → CF
   `custom_hostnames` API (`ssl: {method:"txt", type:"dv"}`) + writes `HOST_MAP[hostname]=slug`.
2. **Customer adds DNS at their registrar** (the PM UI now shows all of these — see fix in trap #7):
   - **Routing:** `CNAME www.<domain> → cf.bizbeecms.com` (subdomain). An apex can't CNAME → use
     `A @ → 104.21.34.242` + `A @ → 172.67.210.25` (CF anycast).
   - **Cert validation:** add the `_acme-challenge.<host>` **TXT** record(s) CF returns (the hostname
     is created with TXT method, so the TXT — NOT the DCV CNAME — is what validates it). Two TXT values
     are returned; add both. Cert goes `pending_validation` → `active` within minutes.
3. **Fallback Origin = `cf.bizbeecms.com`** (SSL/TLS → Custom Hostnames → Fallback Origin), and its DNS
   record MUST be **originless: `AAAA 100::`, Proxied** — ⚠️ NOT `A 192.0.2.1`. A real IP makes CF
   attempt an origin pull → **522 Connection timed out**. `100::` is the documented black-hole that tells
   CF to route to the edge/Worker instead. (This was the 522 we hit.)
4. **Router `*/*` route** — CF-for-SaaS only delivers custom-hostname traffic to a Worker via a `*/*`
   route on the fallback-origin zone (CF "Worker as origin" docs). A host-specific route does NOT catch
   SaaS traffic. `cf.bizbeecms.com/*` alone is NOT enough — the router never fired until `*/*` existed.
5. **Protect infra hosts from `*/*`** — `*/*` is greedy and (on this zone) BEATS the Worker custom
   domains for manager/deployer (verified: they 404'd the instant `*/*` went live). Fix: PM and deployer
   each declare a MORE-SPECIFIC route for their own host (`manager.bizbeecms.com/*`,
   `deployer.bizbeecms.com/*`) in their wrangler.jsonc, which out-specifics `*/*`. Verified: all three
   (manager 200, deployer its-own-404, www.restovista 200) work simultaneously.

**Net zone route table (live, working):** `*/*`→router, `manager.bizbeecms.com/*`→PM,
`deployer.bizbeecms.com/*`→deployer, `cf.bizbeecms.com/*`+`*.site.bizbeecms.com/*`→router (last two
redundant under `*/*`, kept for clarity). Adding a NEW infra host on the zone? It WILL be swallowed by
`*/*` unless you add its own more-specific route.

### 7. PM UI hid the DV records the customer must add
The deployer read `ssl.txt_name` (top-level), but CF returns DV records under `ssl.validation_records[]`
(+ a DCV-delegation CNAME under `ssl.dcv_delegation_records[]`). So the form showed only the routing
CNAME and told the operator to "add the TXT record" it never displayed. Fixed: deployer parses both
shapes; form shows routing (CNAME + apex A) and all validation records.

### 8. SSO on a custom domain bounced the user to workers.dev (host-chain) — VERIFIED FIXED
Logging into a CMS admin at a custom domain (e.g. `restovista.com/admin`) completed SSO but dumped the
user on `bizbeecms-cms-<slug>.workers.dev/admin`. The whole SSO chain ran on the wrong host. Two layers:

- **The SSO return URL was built from the wrong host.** `CMS/admin/layout.tsx` built
  `return=https://<host>/api/auth/sso-callback` from `x-forwarded-host`. But the router proxies custom
  domains to the Worker's INTERNAL `workers.dev` origin, and **OpenNext/Next normalizes
  `x-forwarded-host` (and the request host) to that workers.dev URL** — so the real `restovista.com` was
  lost and the entire chain (PM cms-sso → callback) ran on workers.dev. Fix: the router forwards the real
  host in a private **`x-bizbee-host`** header (OpenNext leaves it untouched); the layout reads it.
- **The callback redirected to an absolute internal origin.** `sso-callback/route.ts` did
  `new URL('/admin', request.url).origin` — and `request.url` inside the Worker is the workers.dev URL.
  Fix: redirect with a **relative `Location: /admin`** (no host) — the browser stays on whatever host it
  requested. This also closed an open-redirect (no host built from a spoofable header).
- **Security: `x-bizbee-host` is HMAC-signed.** A direct workers.dev hit could forge `x-bizbee-host` to
  spoof the SSO return → open redirect. The router signs the host with the shared `CMS_AUTH_SECRET`
  (`x-bizbee-host-sig`); the CMS (`lib/auth/forwarded-host.ts`, unit-tested) trusts the header ONLY when
  the signature verifies (constant-time), else falls back to the request host. PM's `cms-sso` ALSO
  re-validates the return host against `HOST_MAP`/own-zone — defense in depth. The router needs the
  `CMS_AUTH_SECRET` secret set (= the shared value the deployer injects into every CMS).

**RULE: the CMS has exactly ONE host-dependent URL build (the SSO returnUrl in admin/layout.tsx). Keep
it there, keep it signature-gated. Everything else (sso-callback, asset/page/component routes) is
host-independent (relative redirect / searchparams only). Don't reintroduce `url.origin`/`x-forwarded-host`
based absolute URLs in the CMS.**

### 4. ✅ WHAT WORKS NOW: per-Site default URL stays workers.dev (option B)
`cmsWorkerUrl()` (`ProjectManager/src/lib/deploy/worker-url.ts`) returns
`https://<workerName>.vali-draganescu88.workers.dev` directly. No ACM cost. Customer-owned custom
domains still work for free via the existing `/attach-domain` + `HOST_MAP` + router flow (each is a single
CF-for-SaaS custom hostname, which the free cert covers). To activate `.site.*` later: enable ACM, add
`*.site` DNS, flip `cmsWorkerUrl` back to `siteUrlForSlug(slug)` (a `ponytail:` comment marks the line).

### 5. The cutover broke SSO **and** deploy-callbacks via STALE ORIGINS pointing at dead workers.dev
**This is the big one — one root cause, two broken features.** When PM deployed on its custom domain,
its `*.workers.dev` URL was disabled (404). But the deployer still injected the OLD workers.dev origin:
- **SSO "Access denied" (signed in, no access):** the per-site CMS worker had `PM_ORIGIN =
  https://bizbeecms-projectmanager.vali-draganescu88.workers.dev` (injected at its 08:57 deploy, before
  the cutover). The CMS's nonce-exchange + `cms-validate` calls hit that dead 404 URL → guard denied.
- **Stuck "Deploying" forever:** the deployer's `PM_CALLBACK_ORIGIN` secret still pointed at the dead
  workers.dev, so the container's completion callback (`${PM_CALLBACK_ORIGIN}/api/deploy-callback`) and
  step-events (`/api/deploy-events`) 404'd — PM never learned the deploy finished, row stayed `deploying`.
**Fixes:** (a) committed `vars.PM_ORIGIN = https://manager.bizbeecms.com` in `deployer/wrangler.jsonc`;
(b) `wrangler secret put PM_CALLBACK_ORIGIN` = `https://manager.bizbeecms.com` on the deployer;
(c) **redeploy each CMS site** so it re-injects the new `PM_ORIGIN`. Verified: SSO end-to-end works
(login at manager.* → open `bizbeecms-cms-test-1.workers.dev/admin` → admin UI renders).
**RULE: any future origin/hostname change MUST update both `PM_ORIGIN` (committed var) AND
`PM_CALLBACK_ORIGIN` (secret) on the deployer, then redeploy every live CMS site. Old vars are baked
into already-deployed CMS workers until they're redeployed.**

### Diagnosing a wedged CMS worker — read its INJECTED vars
Account-scoped token CAN read a worker's plain-text vars (secrets show as null):
`GET /accounts/<acct>/workers/scripts/bizbeecms-cms-<slug>/settings` → `result.bindings[]` →
check `PM_ORIGIN`, `SITE_ID`, `CMS_AUTH_SECRET` text values. This is how we found the stale `PM_ORIGIN`.
To find WHICH cms-validate gate fails (no-user vs no-site vs no-reach), add temporary `console.log`s in
`cms-validate/route.ts` and read `wrangler tail bizbeecms-projectmanager` — **never** put diagnostics in
the response body (info disclosure; security review will flag it).

### Stuck-deploy recovery
A `deploying` row past `STUCK_AFTER_MS` (10 min, `ProjectManager/src/lib/deploy/deploy-state.ts`) is
flagged stuck in the UI with a Cancel/Restart button. Cancel sets status → `failed` (the container is
out-of-band, can't be killed). If the worker is actually live (callback just failed), the honest fix is
`UPDATE sites SET status='deployed' WHERE slug=… AND status='deploying'` via
`wrangler d1 execute bizbeecms --remote`. Fixing the callback origin (trap #5) prevents future stuck rows.

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
  │  @manager.bizbeecms.com │   POST /api/deploy-callback         │  runs in-container:      │
  │  (workers.dev DISABLED) │   (status back to PM)               │   git clone REPO_URL     │
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

### Status (updated 2026-06-19)
- ✅ `bizbeecms-router` deployed. Routes: `cf.bizbeecms.com/*` AND `*.site.bizbeecms.com/*`
  (the `.site.*` route is **DORMANT** — no DNS/cert resolves to it yet; see trap #3).
  `HOST_MAP` KV (`1c276b01cd5a41f0b8c98ace07b4c064`) bound to both router and deployer.
- ✅ Infra Worker custom domains live on the zone: `manager.bizbeecms.com` (PM),
  `deployer.bizbeecms.com` (deployer). DNS dashboard shows both as Type=Worker, Proxied.
- ✅ `cf.bizbeecms.com` dummy proxied A record (`192.0.2.1`) in the zone.
- ✅ **Stale `*.bizbeecms.com/*` → `bizbee-platform-dispatcher` route DELETED** (trap #1) —
  it was shadowing the infra custom domains. Do NOT re-add a bare `*.bizbeecms.com/*` route
  (trap #2). If you ever need a zone-wide route, point it at `bizbeecms-router`, not a dispatcher.
- ✅ **CF-for-SaaS custom customer domains WORK END-TO-END** (verified 2026-06-19:
  `https://www.restovista.com` → test-1 CMS, valid cert). The deployer's `CF_API_TOKEN` has the
  needed zone SSL perms (the `/attach-domain` call succeeded). Full working recipe = **trap #6**.
- ✅ **Fallback Origin = `cf.bizbeecms.com`** set and Active; its DNS is **`AAAA 100::` Proxied**
  (originless — NOT `192.0.2.1`, which 522'd; trap #6 step 3).
- ✅ **Router `*/*` route live** + specific `manager.*`/`deployer.*` routes protect the infra hosts.
- ⚠️ Per-site `<slug>.site.bizbeecms.com` is still NOT live (needs paid ACM + `*.site` DNS, trap #3).
  Sites serve on workers.dev (option B, trap #4); customer-owned domains are the supported custom-URL path.

## Env-var / secret status (verified live 2026-06-18)

| Where | Name | Purpose | Status |
|---|---|---|---|
| **PM Worker** ✅ deployed | `DB` (D1 `bizbeecms`, id `69cda498…`) | PM data (users/sites) | ✅ provisioned + migrated |
| PM | `SESSIONS` (KV, id `f400b577…`) | session records keyed `session:<id>` | ✅ provisioned |
| PM | `ASSETS` | PM static assets | ✅ live |
| PM | `APP_ORIGIN` (var) | invite/accept link origin (Host-injection guard) | ✅ **`https://manager.bizbeecms.com`** (cutover 2026-06-19) |
| PM | `DEPLOYER_URL` (var) | where PM POSTs Site deploys | ✅ **`https://deployer.bizbeecms.com`** (cutover 2026-06-19) |
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
| deployer | `PM_CALLBACK_ORIGIN` (secret) | PM origin for deploy status callback + step-events **+ fallback for PM_ORIGIN** | ✅ **`https://manager.bizbeecms.com`** (updated 2026-06-19; was stale workers.dev → stuck deploys, trap #5) |
| deployer | `CMS_AUTH_SECRET` (secret) | passed to each CMS via `--var`; **without it CMS auth fails closed → every admin route 401s** | ✅ **set 2026-06-18** (= PM's value) |
| deployer | `PM_ORIGIN` (var, **committed**) | injected into each CMS as `PM_ORIGIN`; where CMS calls `/api/auth/cms-validate` + nonce-exchange | ✅ **`https://manager.bizbeecms.com`** — now a committed `vars` entry in `deployer/wrangler.jsonc` (not a secret); code falls back to `PM_CALLBACK_ORIGIN` if unset (`deployer/src/index.ts:262`) |
| **CMS Worker** (per-Site) | `SITE_ID` / `PM_ORIGIN` / `CMS_AUTH_SECRET` (vars) | injected by deployer `--var` at deploy. `PM_ORIGIN`=`manager.bizbeecms.com`. **Baked in at deploy time — a stale origin requires a REDEPLOY (trap #5).** | auto on deploy (empty placeholders in `CMS/wrangler.jsonc`); served at `bizbeecms-cms-<slug>.vali-draganescu88.workers.dev` |
| CMS | `DB` (per-Site D1) | the Site's content | ❌ **NOT auto-created** — manual (see below) |
| CMS | `MEDIA` (R2 bucket) | media library | ❌ **NOT auto-created** — manual |
| CMS | `AI` (Workers AI) + AI Gateway `bizbeecms-ai-gateway` | chat / AI tools | ❌ gateway is a manual dashboard step; binding works once it exists. Slug MUST match the gateway on the account or `env.AI.run` fails `2001: Please configure AI Gateway` (fixed 2026-06-19). |
| **router Worker** ✅ deployed (2026-06-18) | `HOST_MAP` (KV `1c276b01…`) | host → slug lookup | ✅ bound |
| router | `WORKERS_SUBDOMAIN` (var) | builds the per-Site `.workers.dev` proxy target (`vali-draganescu88`) | ✅ set |

Legend: ✅ verified live · ❌ not provisioned / not automated · ⚠️ caveat. **All control-plane secrets
are now set — the only open items are per-Site/account infra (D1, R2, AI Gateway) and verification.**

---

## Config & magic-value inventory (where every CF constant lives)

Every Cloudflare config/resource string in the codebase, and the ONE place each is
defined. "Magic strings" are centralized per-component (the four packages can't share
imports — each is its own npm package). When a value changes, edit only the source-of-truth
cell; the bash-container strings and wrangler files are the exceptions (noted inline).

### Source-of-truth files
| Constant | Value | Defined in | Consumed by |
|---|---|---|---|
| Account workers.dev subdomain | `vali-draganescu88` | `ProjectManager/src/lib/config/hosts.ts` (`ACCOUNT_WORKERS_SUBDOMAIN`) · `router/wrangler.jsonc` (`vars.WORKERS_SUBDOMAIN`) | PM: `worker-url.ts`; router: `src/index.ts` (env var) |
| workers.dev suffix | `.vali-draganescu88.workers.dev` | `hosts.ts` (`WORKERS_DEV_SUFFIX`, derived) | PM `cmsWorkerUrl()` |
| CMS worker name prefix | `bizbeecms-cms-` | `hosts.ts` (`CMS_WORKER_PREFIX`) · `deployer/src/index.ts` (`WORKER_PREFIX`) | PM URL build; deployer naming |
| Registrable zone | `bizbeecms.com` | `hosts.ts` (`ZONE_DOMAIN`) · all 4 `wrangler.jsonc` routes | PM host-trust checks; CF routes |
| PM origin | `https://manager.bizbeecms.com` | `hosts.ts` (`PM_ORIGIN`, derived) · `ProjectManager/wrangler.jsonc` (`vars.APP_ORIGIN`) · `deployer/wrangler.jsonc` (`vars.PM_ORIGIN`) | PM links; injected into each CMS as `PM_ORIGIN` |
| Deployer URL | `https://deployer.bizbeecms.com` | `ProjectManager/wrangler.jsonc` (`vars.DEPLOYER_URL`) | PM → deployer `POST /deploy` |
| Custom-domain fallback origin | `cf.bizbeecms.com` | `hosts.ts` (`CUSTOM_DOMAIN_FALLBACK_ORIGIN`) · `deployer/src/index.ts` (`CUSTOM_DOMAIN_FALLBACK_ORIGIN`) · `router/wrangler.jsonc` route | shown to customer; CF-for-SaaS CNAME target |
| CF apex anycast IPs | `104.21.34.242`, `172.67.210.25` | `hosts.ts` (`CUSTOM_DOMAIN_APEX_IPS`) · `deployer/src/index.ts` (`CUSTOM_DOMAIN_APEX_IPS`) | A records shown to customer for apex domains |
| Originless fallback DNS | `AAAA 100::` (NOT `192.0.2.1` — 522s) | **dashboard only** (DNS record, not in code) | CF for SaaS fallback origin — see trap #6 |
| AI Gateway slug | `bizbeecms-ai-gateway` | `CMS/wrangler.jsonc` (`vars.AI_GATEWAY`) + `CMS/src/lib/ports/ai.ts` (`DEFAULT_AI_GATEWAY`) | CMS `env.AI.run()` via gateway. Must name a real account gateway or every chat message errors `2001`. |

> **PM ↔ deployer duplication is deliberate.** `hosts.ts` and `deployer/src/index.ts` each
> hold their own copy of the worker prefix / fallback origin / apex IPs because they're
> separate packages with no shared module. Both are listed above; change them together.

### Resource IDs (`wrangler.jsonc` bindings — the canonical place for IDs)
| Resource | ID | Binding | Files |
|---|---|---|---|
| PM D1 `bizbeecms` | `69cda498-69e6-44ce-9814-826afffa4a1a` | `DB` | `ProjectManager/wrangler.jsonc` |
| PM sessions KV | `f400b577848f4e4aa6845d2fb46a601e` | `SESSIONS` | `ProjectManager/wrangler.jsonc` |
| HOST_MAP KV | `1c276b01cd5a41f0b8c98ace07b4c064` | `HOST_MAP` | PM + deployer + router `wrangler.jsonc` (shared) |
| CMS D1 (per-Site) | placeholder `0000…` → real id at deploy | `DB` | `CMS/wrangler.jsonc`; deployer patches per-Site (`DB_NAME=bizbeecms-cms-<slug>`) |
| CMS R2 (per-Site) | `bizbeecms-cms-media` → `…-<slug>` at deploy | `MEDIA` | `CMS/wrangler.jsonc`; deployer patches (`BUCKET_NAME=bizbeecms-cms-media-<slug>`) |
| Account id `f510a160…` / zone id `dfaec5f7…` | — | — | **secrets only** (`CF_ACCOUNT_ID`, `CF_ZONE_ID` on deployer); not hardcoded in source |

### Deliberately NOT centralized
- **Per-Site resource names in the deployer's container bash script** (`DB_NAME`,
  `BUCKET_NAME`, `--name`, `--compatibility-date 2025-09-01`, `--var SITE_ID/PM_ORIGIN/CMS_AUTH_SECRET`):
  the script runs as bash inside the Sandbox Container and can't import the TS constants.
  Marked with a `ponytail:` comment at `deployer/src/index.ts` (DB_NAME line). Keep in sync
  with `WORKER_PREFIX` by hand.
- **`compatibility_date` / `compatibility_flags`**: per-Worker in each `wrangler.jsonc`
  (PM+CMS `2025-03-25`, deployer+router `2025-09-01`). Intentionally independent per worker.
- **Account id / zone id**: live as deployer **secrets**, never in source. Don't inline them.

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
- Confirm: `npx wrangler deployments list` · `curl -sS https://manager.bizbeecms.com/login` (expect 200).
- **PM deploy disables workers.dev** (no `workers_dev` key) — the old `*.workers.dev` PM URL 404s after.
  This is expected; `manager.bizbeecms.com` is the only entry point.

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

- **AI Gateway** `bizbeecms-ai-gateway` — dashboard → AI → AI Gateway; enable **Workers AI**. Once, shared
  across Sites. The slug MUST match `vars.AI_GATEWAY` / `DEFAULT_AI_GATEWAY` exactly, else `env.AI.run`
  fails `2001: Please configure AI Gateway` on every chat message. (Override per-Site with the `AI_GATEWAY`
  var if you use a different slug.)
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

- ✅ **PM live on `manager.bizbeecms.com`** — 2026-06-19 (`/`→307→`/login` 200).
- ✅ **deployer live on `deployer.bizbeecms.com`** — 2026-06-19.
- ✅ **router live** — `cf.bizbeecms.com/*` + dormant `*.site.bizbeecms.com/*`.
- ✅ **A CMS site is deployed & live**: `bizbeecms-cms-test-1.vali-draganescu88.workers.dev` serves 200.
- ✅ **CMS→PM SSO verified END-TO-END LIVE** — 2026-06-19, on BOTH the workers.dev host AND a custom
  customer domain. Login at `manager.bizbeecms.com` → open `www.restovista.com/admin` → SSO completes and
  the user **stays on `www.restovista.com/admin`** (no workers.dev bounce). Required: trap #5 (origins),
  trap #8 (host chain: signed `x-bizbee-host` + relative callback redirect).
- ✅ **Deploy callback + step-events verified** — fixed by the `PM_CALLBACK_ORIGIN` update (trap #5);
  deploys now complete (no more stuck `deploying` rows from a 404'd callback).
- ❌ **Per-Site D1 / R2 / AI Gateway** still not auto-provisioned (manual, Part C). test-1 runs because
  its infra was set up by hand. The `<slug>.site.bizbeecms.com` custom hostname is not live (trap #3).

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
