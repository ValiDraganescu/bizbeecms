# Deploy architecture — current state (authoritative)

> **Future agents: read THIS before investigating deploy.** It is the current, verified
> map of how PM, the deployer, and per-Site CMS Workers relate, plus the exact env-var /
> secret status. It exists so you don't re-run a blind multi-file search. Last verified
> **2026-06-18** against the live `wrangler whoami` account + a real PM deploy.
>
> If something here contradicts `DEPLOY.md`: **this file wins on architecture.** `DEPLOY.md`'s
> step 11 + lower troubleshooting describe the OLD in-PM Script-Upload path (`buildScriptUploadForm`,
> `PUT /workers/scripts`, the DO-strip + assets-404 blockers). That path is **superseded** by the
> deployer-Container path below — wrangler inside the container handles DOs and static assets
> natively, so those blockers no longer apply. `DEPLOY.md` steps 0–10 (PM's own deploy) are still
> accurate.

---

## The three actors

```
                         ┌──────────────────────────────────────────────────────────┐
                         │  Cloudflare account  f510a16043d1521697b8974165f9c78d     │
                         │  (vali.draganescu88@gmail.com — OAuth, workers/d1/kv write)│
                         └──────────────────────────────────────────────────────────┘

  ┌─────────────────────────┐         POST /deploy                ┌──────────────────────────┐
  │  ProjectManager (PM)    │   Bearer DEPLOYER_SECRET            │  deployer Worker         │
  │  Worker — DEPLOYED ✅   │   body {siteId, slug}               │  + Sandbox Container     │
  │                         │ ──────────────────────────────────▶│  status: code-complete,  │
  │  bizbeecms-             │                                     │  DEPLOY STATE UNKNOWN ❔  │
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
            │  + forwarded bizbee_session cookie + {siteId}        │  NONE DEPLOYED YET ❔     │
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
   handled correctly (this is why the old DO-strip / assets-404 blockers are moot here).
4. Deployer POSTs status back to PM at `${PM_CALLBACK_ORIGIN}/api/deploy-callback`; PM sets
   Site `status=deployed` (+ `worker_name`) or `failed`.
5. Once live, every CMS admin request runs `requireAdmin` → CMS forwards the `bizbee_session`
   cookie + `{siteId: env.SITE_ID}` + `Bearer CMS_AUTH_SECRET` to PM's `/api/auth/cms-validate`,
   which resolves the PM session and runs PM's site-reach check. **Any PM user with access to the
   Site is a CMS admin.** (See `pm-cms-auth-decision` memory + `HITL.md` Done P0.)

## Env-var / secret status

| Where | Name | Purpose | Status |
|---|---|---|---|
| **PM Worker** | `DB` (D1 `bizbeecms`, id `69cda498…`) | PM data (users/sites/sessions-meta) | ✅ provisioned + migrated |
| PM Worker | `SESSIONS` (KV, id `f400b577…`) | session records keyed `session:<id>` | ✅ provisioned |
| PM Worker | `ASSETS` | PM static assets | ✅ live |
| PM Worker | `APP_ORIGIN` | invite/accept link origin (Host-injection guard) | ✅ set (`https://bizbeecms-projectmanager…workers.dev`) |
| PM Worker | `DEPLOYER_URL` | where PM POSTs Site deploys | ✅ set → `https://bizbeecms-deployer.vali-draganescu88.workers.dev` |
| PM Worker | `DEPLOYER_SECRET` | bearer PM→deployer | ❔ **must be set as a secret** on PM (shared w/ deployer) |
| PM Worker | `CMS_AUTH_SECRET` | bearer CMS→PM `/api/auth/cms-validate` accepts | ❔ **must be set** on PM (shared w/ deployer's value) |
| PM Worker | `CF_API_TOKEN`, `CF_ACCOUNT_ID` | (old Script-Upload path only) | ⚠️ not needed by the container path; deployer holds CF creds now |
| **deployer Worker** | `CF_API_TOKEN` | Workers Scripts: Edit — deploys the CMS Worker | ❔ **set before first CMS deploy** |
| deployer | `CF_ACCOUNT_ID` | account owning CMS Workers (`f510a160…`) | ❔ **set** |
| deployer | `DEPLOYER_SECRET` | bearer it requires from PM | ❔ **set** (= PM's value) |
| deployer | `REPO_URL` | https clone URL of this repo | ❔ **set** |
| deployer | `GITHUB_TOKEN` | PAT, only if repo private | ❔ optional |
| deployer | `PM_CALLBACK_ORIGIN` | PM origin for status callback | ❔ **set** = PM URL |
| deployer | `CMS_AUTH_SECRET` | passed to each CMS via `--var` | ❔ **set** (= PM's value) — **without it CMS auth fails closed → every admin route 401s** |
| deployer | `PM_ORIGIN` | passed to each CMS via `--var` (where `/api/auth/cms-validate` lives) | ❔ **set** = PM URL |
| **CMS Worker** (per-Site) | `SITE_ID` / `PM_ORIGIN` / `CMS_AUTH_SECRET` | injected by deployer `--var` | auto on deploy (empty placeholders in `CMS/wrangler.jsonc`) |
| CMS Worker | `DB` (per-Site D1) | the Site's content | ❌ **NOT auto-created** — manual `wrangler d1 create` + migrations |
| CMS Worker | `MEDIA` (R2 bucket) | media library | ❌ **NOT auto-created** — manual `wrangler r2 bucket create` |
| CMS Worker | `AI` (Workers AI) + AI Gateway `bizbeecms-cms` | chat / AI tools | ❌ gateway is a manual dashboard step; binding works once gateway exists |

Legend: ✅ verified live · ❔ code expects it, not confirmed set · ❌ not provisioned / not automated · ⚠️ caveat.

## What is NOT automated (manual, once per account or per Site)

The deployer does **not** provision infra — it only builds + `wrangler deploy`s the CMS Worker.
Before/around a CMS deploy a human must, with CF auth:
- **AI Gateway** `bizbeecms-cms` (dashboard → AI → AI Gateway) + Workers AI enabled — once, shared.
- **per-Site D1**: `wrangler d1 create …` then `wrangler d1 migrations apply` (CMS migrations, incl. `0002_*` asset table).
- **per-Site R2 bucket** (`bizbeecms-cms-media` or per-Site) bound as `MEDIA`.
- The CMS Worker's `wrangler.jsonc` `DB`/`MEDIA` ids are placeholders → the deploy step must override them per-Site (same mechanism as the `--var`s), OR pre-create and reference real ids.

## Verified vs unverified (be honest in reports)

- ✅ **PM deploys and runs** — done 2026-06-18, version `a555b3d7-1f87-46e6-90ca-46188833d361`.
- ✅ **Sec1 wiring exists in code**: deployer injects the 3 vars (`deployer/src/index.ts:191-194`);
  PM `/api/auth/cms-validate` + CMS `guard-core.ts`/`guard.ts` are built and unit-tested.
- ❔ **deployer Worker deployed + its secrets set** — UNKNOWN; required before any CMS deploy works.
- ❔ **A real CMS Worker has ever booted** — no evidence one has; the cross-Worker auth round-trip
  (CMS→PM) has never run live. This is the open `HITL.md` P1.

## Pointers (don't re-derive these)

- PM→deployer trigger: `ProjectManager/src/app/api/sites/[id]/deploy/route.ts`
- deployer + container + `wrangler deploy` command: `deployer/src/index.ts` (`:191-194` for the deploy line)
- deployer required secrets: `deployer/wrangler.jsonc:26-32` (comment block)
- CMS auth bridge: `ProjectManager/src/app/api/auth/cms-validate/route.ts` ←→ `CMS/src/lib/auth/guard-core.ts` + `guard.ts`
- CMS per-Site vars declared empty: `CMS/wrangler.jsonc` (`SITE_ID`/`PM_ORIGIN`/`CMS_AUTH_SECRET`)
- Auth decision rationale: memory `pm-cms-auth-decision`; deploy mechanism: memory `pm-cms-deploy-via-container`
- PM's own deploy runbook (steps 0–10): `DEPLOY.md` (its step 11 is the superseded path — see top note)
- Live HITL items to verify post-deploy: `HITL.md`
```
