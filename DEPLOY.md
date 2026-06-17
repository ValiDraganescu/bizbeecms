# Deploy runbook — ProjectManager → Cloudflare → CMS Worker

The single ordered procedure to take **bizbeecms ProjectManager (PM)** live on Cloudflare
Workers, and from that deployed PM trigger a **real CMS website deploy** (a per-Site CMS
Worker uploaded via the Cloudflare API).

> Everything below runs **inside `ProjectManager/`** unless stated otherwise.
> The PM app is its own npm package (own `node_modules`/`package.json`), NOT a workspace.
>
> The PM source is **code-complete end-to-end**; the only thing this runbook adds is the
> live Cloudflare auth + resources that no CI/dev env here has. Each step is verifiable.

---

## 0. Prerequisites (once)

- A **Cloudflare account** on a plan that allows Workers (the CMS deploy uploads a Worker
  per Site via the Workers Script-Upload API; a paid Workers plan is needed for some
  features such as Email Sending — see step 6).
- `wrangler` is already a PM devDependency (`npx wrangler …`). Authenticate:
  ```bash
  cd ProjectManager
  npx wrangler login          # browser OAuth; or set CLOUDFLARE_API_TOKEN env for CI
  npx wrangler whoami         # confirm account + email
  ```
- Note your **Account ID** (`npx wrangler whoami`, or Cloudflare dashboard → Workers & Pages → right sidebar). You need it in step 5.

---

## 1. Create the D1 database

```bash
cd ProjectManager
npx wrangler d1 create bizbeecms
```
Copy the printed `database_id` (a UUID).

## 2. Create the KV namespace for sessions

```bash
npx wrangler kv namespace create SESSIONS
```
Copy the printed namespace **`id`** (32 hex chars).

## 3. Paste the real ids into `wrangler.jsonc`

Edit `ProjectManager/wrangler.jsonc` and replace the **placeholder zero-ids**:

- `d1_databases[0].database_id` — currently `00000000-0000-0000-0000-000000000000` → the UUID from step 1.
- `kv_namespaces[0].id` — currently `00000000000000000000000000000000` → the id from step 2.

> The preflight check (step 8) fails if either id still matches `/^[0-]+$/`, so you can't
> forget this. Keep the `nodejs_compat` and `global_fetch_strictly_public` compat flags —
> OpenNext needs both; preflight also enforces them.

Regenerate the offline Cloudflare types after editing bindings:
```bash
npm run cf-typegen      # rewrites the (gitignored) cloudflare-env.d.ts
```

## 4. Apply database migrations to the remote D1

```bash
npm run db:migrate      # = wrangler d1 migrations apply bizbeecms --remote
```
This applies `migrations/0000_*.sql` and `0001_*.sql` (users, invites, sites, site_users)
to the real D1. Verify:
```bash
npx wrangler d1 execute bizbeecms --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table';"
```
You should see the `users`, `invites`, `sites`, `site_users` tables.

## 5. Set deploy secrets on the PM Worker

The in-app **Site deploy** flow calls the Cloudflare API to upload a CMS Worker. It reads
two secrets off the running PM Worker's env (see `src/lib/deploy/cloudflare.ts`). Without
**both**, a deploy returns `notConfigured` and marks the Site `failed` (graceful, by design).

```bash
npx wrangler secret put CF_API_TOKEN     # paste a token scoped "Workers Scripts: Edit"
npx wrangler secret put CF_ACCOUNT_ID    # paste your account id from `wrangler whoami`
```
Create the API token at Cloudflare dashboard → My Profile → API Tokens → Create Token →
template **"Edit Cloudflare Workers"** (or a custom token with **Account → Workers Scripts → Edit**).

## 6. Set `APP_ORIGIN` (and optionally email)

`APP_ORIGIN` is the trusted public origin used to build invite/accept links. Invite-link
generation **refuses** to fall back to the request `Host` header in production (Host Header
Injection guard, `src/lib/mail/send-invite.ts`), so this must be set or invites break.

Set it as a plain var in `wrangler.jsonc` (uncomment the `vars` block shown there) **or**:
```bash
npx wrangler secret put APP_ORIGIN       # e.g. https://pm.bizbeecms.example
```
(Preflight only WARNs if it's unset — it's not a hard blocker, but invites won't work without it.)

Optional — **email invite delivery** via Cloudflare Email Sending (Beta, Workers Paid):
uncomment the `send_email` binding in `wrangler.jsonc` and set a verified
`destination_address`. Without it the invite flow degrades to showing the accept link in-app.

## 7. Build the CMS bundle artifact

The PM ships the CMS as a **committed pre-bundled artifact** (it can't shell out to a build
on a Worker). Regenerate it so the deploy ships the current `CMS/` app:
```bash
npm run bundle:cms      # = node scripts/build-cms-bundle.mjs --opennext
```
This runs OpenNext over `CMS/` then esbuilds it into `src/lib/deploy/cms-bundle.generated.js`
(~4MB, committed). **Re-run this after ANY change to the `CMS/` app**, or deploys ship a
stale CMS.

## 8. Run the pre-deploy preflight (final gate)

```bash
npm run preflight       # = node scripts/preflight-deploy.mjs
```
Read-only, no extra auth. It must exit `0`. It blocks on:
- placeholder zero-ids in `wrangler.jsonc` (steps 1–3 fix this),
- missing compat flags (`nodejs_compat`, `global_fetch_strictly_public`),
- missing / empty / <100KB CMS bundle artifact (step 7 fixes this),
- a **structurally broken CMS bundle** — preflight now runs the bundle **boot self-check**
  (`npm run bundle:selfcheck`, `scripts/bundle-selfcheck.mjs`): the artifact must declare
  `worker.js` as entry, expose a `default` export + `fetch` handler, and contain **no
  unresolved bare imports** (only `node:`/`cloudflare:` may stay external).

`APP_ORIGIN`-unset is a WARNING only. The **Durable Object gap is now RESOLVED**
(see ✅ in step 11): `build-cms-bundle.mjs` strips OpenNext's DO re-exports, so the
self-check no longer warns and a live upload won't be rejected for undeclared DOs.

## 9. Build and deploy the PM Worker

> **NEVER run the OpenNext build while `next dev` is running on port 3601** — it corrupts
> `.next` and 500s the dev server. Check `lsof -ti:3601`; if `next-server` is there, kill it
> and `rm -rf .next .open-next` before building.

```bash
npm run deploy          # = opennextjs-cloudflare build && opennextjs-cloudflare deploy
```
`opennextjs-cloudflare build` emits `.open-next/worker.js`; `deploy` runs `wrangler deploy`
under the hood, uploading the PM Worker + assets and binding D1/KV per `wrangler.jsonc`.

Confirm it's live:
```bash
npx wrangler deployments list
curl -sS https://<your-pm-worker-url>/api/health
```

---

## 10. First-run bootstrap (in the deployed PM)

1. Open the deployed PM URL. With an empty `users` table, `/register` is **open**.
2. Register the **first** user → becomes **SuperAdmin** (with invite rights). After this,
   `/register` self-closes; further users come via the invite flow.
3. (Optional) Invite Admins / SiteManagers, scope by country.

## 11. Trigger a real CMS deploy from the deployed PM

This is the milestone's payoff: **PM running on Cloudflare provisions a CMS Worker.**

1. In PM, create a **Site** (Sites → New). The Site gets a slug; its CMS Worker will be
   named `bizbeecms-cms-<slug>` (clamped to 63 chars).
2. Open the Site detail page → **Deployment** card → click **Deploy** (or **Redeploy**).
3. Server-side this runs `deploySiteAction` → `buildCmsBundle()` → `deploySite()`, which:
   - latches the Site `status` → `deploying`,
   - `PUT /accounts/{CF_ACCOUNT_ID}/workers/scripts/bizbeecms-cms-<slug>` with the bundle
     (auth: `CF_API_TOKEN`),
   - sets `status` → `deployed` (+ `worker_name`) on success, or `failed` on error.
4. The page `revalidatePath`s, so the status Badge + worker name refresh on the response.
   (There's no live polling of the in-flight `deploying` latch — a refresh shows the final
   state; the `alreadyDeploying` guard makes re-clicks safe.)

### Verify the CMS Worker actually booted

```bash
npx wrangler deployments list --name bizbeecms-cms-<slug>
curl -sS https://bizbeecms-cms-<slug>.<your-workers-subdomain>.workers.dev/
```
A 200 with the default Next.js CMS page = success.

> ✅ **Durable Object gap — RESOLVED.** OpenNext's `worker.js` always re-exports three DO
> classes (`DOQueueHandler`, `DOShardedTagCache`, `BucketCachePurge` — incremental-cache /
> tag-cache / queue), and `buildScriptUploadForm` (`src/lib/deploy/script-upload.ts`) sends
> **no `durable_objects`/`migrations`** metadata, so a live upload of a DO-exporting worker
> would be **rejected by Cloudflare**. The CMS uses **dummy (no-op) caches**
> (`CMS/open-next.config.ts`), so those DOs are never instantiated — they are dead exports.
> `scripts/build-cms-bundle.mjs` now **strips the three DO re-exports** from the entry before
> esbuild, so the committed bundle exports only `default`/`fetch`. `npm run bundle:selfcheck`
> + `npm run preflight` no longer warn about DOs. (The strip self-guards: if a future OpenNext
> rename re-introduces a DO export, the build throws and the self-check test fails.)
>
> ⚠️ **The one remaining unverified link:** the committed CMS bundle is produced by **plain
> esbuild** over OpenNext's `worker.js`, not by wrangler's own OpenNext plugin (wasm/loaders).
> It is shape- **and structure**-verified (the bundle self-check, step 8) but **never booted on
> a live Worker** in any env here. Boot failures (wasm/loaders/defines) are fixed in
> `scripts/build-cms-bundle.mjs` esbuild options — see the "CMS bundle production" caveat in
> `.claude/skills/orc-meeseeks/goals/main/CAVEATS.md`. Treat step 11's curl as the real
> end-to-end acceptance test.

---

## Quick reference — ordered command list

```bash
cd ProjectManager
npx wrangler login
npx wrangler d1 create bizbeecms                       # → database_id
npx wrangler kv namespace create SESSIONS              # → id
#   edit wrangler.jsonc: paste both ids over the zero-id placeholders
npm run cf-typegen
npm run db:migrate
npx wrangler secret put CF_API_TOKEN                   # Workers Scripts: Edit
npx wrangler secret put CF_ACCOUNT_ID
npx wrangler secret put APP_ORIGIN                     # or set vars.APP_ORIGIN in wrangler.jsonc
npm run bundle:cms
npm run preflight                                      # must exit 0
npm run deploy
#   then: register first user (SuperAdmin) → create a Site → Deploy from its detail page
```

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `preflight` fails on zero-ids | Steps 1–3 not done — paste real D1/KV ids into `wrangler.jsonc`. |
| `preflight` fails on bundle | Run `npm run bundle:cms` (step 7). |
| Build 500s / corrupted `.next` | `next dev` was running on 3601 during the OpenNext build. Kill it, `rm -rf .next .open-next`, rebuild. |
| Invite links missing/broken | `APP_ORIGIN` not set (step 6). |
| Site deploy → `failed` immediately, reason `notConfigured` | `CF_API_TOKEN` and/or `CF_ACCOUNT_ID` secret missing (step 5). |
| Site deploy → `failed`, reason `httpError` | Token scope wrong (needs Workers Scripts: Edit) or account id mismatch. Check `wrangler whoami`. |
| Site deploy → `failed`, `httpError`, CF error mentions Durable Objects / migrations | Should be fixed — `build-cms-bundle.mjs` strips OpenNext's DO re-exports (step 11 ✅). If it recurs, the committed bundle is stale: re-run `npm run bundle:cms` and confirm `npm run bundle:selfcheck` shows no DO warning. |
| CMS Worker uploaded but 500s on open | The esbuild-vs-wrangler bundling gap (step 11 ⚠️). Adjust `scripts/build-cms-bundle.mjs` esbuild opts. |
