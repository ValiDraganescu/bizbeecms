---
description: Point the LOCAL dev server (CMS :3602 / PM :3601) at PRODUCTION Cloudflare resources — a Site's real D1/R2 or the PM's D1/KV — via wrangler remote bindings, or restore local Miniflare. Use when the user says "connect to <site>", "connect to production", "use prod DB locally", "go back to local", "disconnect from prod".
argument-hint: cms <site-slug> | pm | local [cms|pm] | status | sites
allowed-tools: Bash, Read
---

# prod-connect

Wrapper around `scripts/prod-connect.mjs`. Everything is generated + gitignored;
committed `wrangler.jsonc` files are never modified.

## Commands

| Ask                                           | Run                                                            |
|-----------------------------------------------|----------------------------------------------------------------|
| "connect to site X" / "connect CMS to prod X" | `scripts/prod-connect.mjs cms <slug>`                          |
| "connect PM to prod"                          | `scripts/prod-connect.mjs pm`                                  |
| "back to local" / "disconnect"                | `scripts/prod-connect.mjs local` (or `local cms` / `local pm`) |
| "what am I connected to?"                     | `scripts/prod-connect.mjs status`                              |
| unknown slug                                  | `scripts/prod-connect.mjs sites` to list, then ask             |

## Procedure

1. Run `scripts/prod-connect.mjs status` first; tell the user the current mode.
2. Run the requested command. It resolves the Site id from the prod PM D1,
   the Site's D1 id (`bizbeecms-cms-<slug>`) and R2 bucket
   (`bizbeecms-cms-media-<slug>`), writes `<app>/wrangler.prod-remote.jsonc`
   + `<app>/.prod-remote.json` (marker) and ensures `<app>/.dev.vars.prod-remote`.
3. **Restart the affected dev server** — `next.config.ts` reads the marker at
   boot. Find the running one (`lsof -iTCP:3602 -sTCP:LISTEN` / `:3601`), kill
   that PID, start `npm run dev` again in the same dir on the same port
   (the user relies on the localhost subdomain → keep the port). Confirm the log
   shows `⚠ PROD-REMOTE MODE` + `Establishing remote connection`, then curl a
   D1-backed route (e.g. `http://localhost:3602/api/pages`) and report the mode.
4. If the script created `.dev.vars.prod-remote`, tell the user which secrets
   are empty (CMS: `CMS_AUTH_SECRET` for PM service calls, `OPENROUTER_API_KEY`
   for AI; PM: `CMS_AUTH_SECRET`, `SITE_SECRET_KEY`, `OPENROUTER_PROVISIONING_KEY`).
   Never invent values; wrangler cannot read deployed secrets back.

## Hard rules

- While connected, **every write hits production data**. Do NOT run migrations
  (`wrangler d1 migrations apply`, `db:migrate`), destructive scripts, or bulk
  edits unless the user explicitly asks knowing it is prod. Say so before any
  write-heavy action.
- Only D1 / KV / R2 / Images are remote. `send_email` stays local (logs, never
  sends). Rate limiter / cache are always local sims.
- CMS admin auth: `CMS_DEV_SUPERADMIN=1` in `CMS/.env.local` still bypasses
  the guard locally, so the admin UI works without SSO against the prod DB.
- Remote D1 is a round-trip per query — slower than Miniflare; expected.
- Never commit `wrangler.prod-remote.jsonc`, `.prod-remote.json`,
  `.dev.vars.*` (all gitignored) and never copy their values into the repo.
- Read-only alternative when the app isn't needed:
  `npx wrangler d1 execute <db-name> --remote --command "select …"`.
