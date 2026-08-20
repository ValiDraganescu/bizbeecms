---
description: Choose what the LOCAL dev servers talk to — point the local CMS (:3602) at a LOCAL test Site (own D1/R2 per Site) or at a PRODUCTION Site's real D1/R2, and the local PM (:3601) at local or prod D1/KV. Use when the user says "connect to <site>", "switch to site X", "use the local X site", "connect to production", "use prod DB locally", "go back to local", "disconnect from prod", "which site am I on".
argument-hint: cms <slug> | cms prod <slug> | pm prod | pm local | local [cms|pm] | status | sites [local|prod]
allowed-tools: Bash, Read
---

# connect

Wrapper around `scripts/connect.mjs` (one script for both local-Site switching and
prod-remote). Everything it writes is gitignored; committed `wrangler.jsonc` files are
never modified.

## Resolving the ask

The CMS always has exactly one target: a **local** Site (from the local PM's D1,
state in `CMS/.wrangler/sites/<slug>/`) or a **prod** Site (remote bindings).
Plain "connect to X" is ambiguous — resolve it like this:

1. User said "prod"/"production"/"live"/"real" → prod.
2. User said "local"/"test"/"dev" → local.
3. Neither: run `scripts/connect.mjs sites` — if the slug exists only locally → local;
   only in prod → say "X only exists in production — connecting to PROD (every write
   is real)" and proceed with prod; in both → **ask** (one question: local or prod?).
   Unknown everywhere → list both and ask.

| Ask                                      | Run                                                                                               |
|------------------------------------------|---------------------------------------------------------------------------------------------------|
| "connect to / switch to local site X"    | `scripts/connect.mjs cms X`                                                                       |
| "connect CMS to prod site X"             | `scripts/connect.mjs cms prod X`                                                                  |
| "connect PM to prod"                     | `scripts/connect.mjs pm prod`                                                                     |
| "PM back to local"                       | `scripts/connect.mjs pm local`                                                                    |
| "back to local" / "disconnect from prod" | `scripts/connect.mjs local` (or `local cms`/`local pm`) — CMS falls back to its active local Site |
| "what am I connected to?"                | `scripts/connect.mjs status`                                                                      |
| unknown slug                             | `scripts/connect.mjs sites [local\|prod]`, then ask                                               |

A local Site that doesn't exist yet must be created in the local PM first
(`/sites/new` on :3601, or the PM MCP `sites_create`); the script refuses unknown slugs.

## Procedure

1. `scripts/connect.mjs status` first; tell the user the current mode.
2. Run the resolved command.
   - local: patches `SITE_ID` in `CMS/.dev.vars`, writes `CMS/.local-site.json`,
     creates + migrates `CMS/.wrangler/sites/<slug>/` on first use.
   - prod: resolves the Site id from the prod PM D1, the Site's D1
     (`bizbeecms-cms-<slug>`) and R2 bucket (`bizbeecms-cms-media-<slug>`), writes
     `<app>/wrangler.prod-remote.jsonc` + `<app>/.prod-remote.json` and ensures
     `<app>/.dev.vars.prod-remote`. The prod marker wins over the local-site marker.
3. **Restart the affected dev server** — `next.config.ts` reads the markers at boot.
   Find the running one (`lsof -iTCP:3602 -sTCP:LISTEN` / `:3601`), kill that PID,
   start `npm run dev` again in the same dir on the same port (the user relies on the
   localhost subdomain → keep the port). Confirm the log line — local:
   `· local-site: <slug> (...)`; prod: `⚠ PROD-REMOTE MODE` + `Establishing remote
   connection` — then curl a D1-backed route (e.g. `http://localhost:3602/api/pages`)
   and report the mode.
4. If the script created `.dev.vars.prod-remote`, tell the user which secrets are
   empty (CMS: `CMS_AUTH_SECRET` for PM service calls, `OPENROUTER_API_KEY` for AI;
   PM: `CMS_AUTH_SECRET`, `SITE_SECRET_KEY`, `OPENROUTER_PROVISIONING_KEY`).
   Never invent values; wrangler cannot read deployed secrets back.

## Hard rules (prod mode)

- While connected to prod, **every write hits production data**. Do NOT run migrations
  (`wrangler d1 migrations apply`, `db:migrate`), destructive scripts, or bulk edits
  unless the user explicitly asks knowing it is prod. Say so before any write-heavy action.
- Only D1 / KV / R2 / Images are remote. `send_email` stays local (logs, never sends).
  Rate limiter / cache are always local sims.
- CMS admin auth: `CMS_DEV_SUPERADMIN=1` in `CMS/.env.local` still bypasses the guard
  locally, so the admin UI works without SSO against the prod DB.
- Remote D1 is a round-trip per query — slower than Miniflare; expected.
- Never commit `wrangler.prod-remote.jsonc`, `.prod-remote.json`, `.local-site.json`,
  `.dev.vars.*` (all gitignored) and never copy their values into the repo.
- Read-only alternative when the app isn't needed:
  `npx wrangler d1 execute <db-name> --remote --command "select …"`. For a LOCAL Site's
  DB add `--local --persist-to CMS/.wrangler/sites/<slug>` (run from `CMS/`).
