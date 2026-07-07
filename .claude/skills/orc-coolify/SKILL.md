---
description: Deploy and manage applications on a Coolify server via its REST API. Creates apps from private GitHub repos via a configured GitHub App, manages environment variables, triggers deploys, and tails build logs. Reads credentials from `COOLIFY_BASE_URL` and `COOLIFY_TOKEN` (configured in Settings → Integrations).
argument-hint: [free-form goal, e.g. "deploy main of repo foo/bar to project quux"]
allowed-tools: Bash, Read, Write, Edit
---

# Your task

Drive the user's Coolify server through its REST API to accomplish the goal in `$ARGUMENTS`. Typical goals:

- "deploy `<branch>` of `<owner>/<repo>` into project `<name>`"
- "redeploy app `<name>`"
- "set env var `KEY=value` on app `<name>` and redeploy"
- "what's the status of app `<name>`?"
- "tail the latest deployment logs for `<name>`"

You operate the API end-to-end — resolve UUIDs from names, make the calls, poll deploys, surface failures with the relevant log slice. **Never** SSH into the Coolify host to run docker commands; Coolify reconciles state from its own DB and out-of-band changes drift the dashboard.

# Step 0 — Read your credentials

Coolify connection details are injected as environment variables by Orchestrator:

- `COOLIFY_BASE_URL` — e.g. `https://coolify.example.com` (no trailing `/api/v1`)
- `COOLIFY_TOKEN` — Sanctum bearer token (abilities: `read`, `write`, `deploy`)

If either is empty:

```bash
[ -z "$COOLIFY_BASE_URL" ] && echo "missing COOLIFY_BASE_URL"
[ -z "$COOLIFY_TOKEN" ] && echo "missing COOLIFY_TOKEN"
```

Stop and tell the user to set them in **Settings → Integrations → Coolify**, then restart this terminal so the new env vars are picked up. Credentials travel through Settings only — the chat never carries a pasted secret.

Sanity-ping before doing anything else:

```bash
curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "$COOLIFY_BASE_URL/api/v1/version"
```

A non-200 here means stop — re-running write calls against a misconfigured server is the wrong move.

# Step 1 — Resolve the targets

Users talk about apps, projects, and servers **by name**; the API works in **UUIDs**. Always look up the UUID once at the start of a task and reuse it.

```bash
# Servers, projects, GitHub Apps
curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" "$COOLIFY_BASE_URL/api/v1/servers"   | jq '.[] | {uuid, name}'
curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" "$COOLIFY_BASE_URL/api/v1/projects"  | jq '.[] | {uuid, name, environments: [.environments[]?.name]}'

# Existing applications
curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" "$COOLIFY_BASE_URL/api/v1/applications" \
  | jq '.[] | {uuid, name, fqdn, git_repository, git_branch, status}'
```

If a name is ambiguous (two apps named `api`), don't guess — list the matches with their project / server and ask the user to disambiguate.

If the user names a GitHub App ("the `orchestrator-deployer` app"), you'll need its `github_app_uuid`. Coolify exposes these under the Sources / GitHub Apps section of the API — check the `/api/v1/sources` (or follow up with the user if the list isn't reachable). The UUID is shown in the Coolify UI under **Sources → GitHub Apps → Settings**, so the user can paste it if needed.

# Step 2 — Create a new app (only when the goal is a NEW app)

When the goal creates an application — from a private GitHub repo via the configured GitHub App, a public repo, a deploy key, or an inline Dockerfile/image/compose file — read [`CREATE-APP.md`](./CREATE-APP.md) for the endpoint, required and recommended body fields, and a worked example. The response includes the new application `uuid` — **save it**; you need it for env vars and deploy polling. Goals against an existing app skip straight to Step 3.

# Step 3 — Manage environment variables

Set one at a time:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  "$COOLIFY_BASE_URL/api/v1/applications/<app-uuid>/envs" \
  -d '{"key":"DATABASE_URL","value":"postgres://…","is_literal":true}'
```

Field semantics:
- `is_literal` — `true` to store the value verbatim; `false` lets Coolify do shell-style interpolation (`$OTHER_VAR`). Default to `true` for secrets and connection strings; use `false` only when you actually want substitution.
- `is_preview` — `true` scopes the variable to PR preview deployments only.
- `is_multiline` — `true` for multi-line values (PEM keys, JWT secrets).
- `is_shown_once` — `true` to mark as write-only in the UI (still readable through the API).

Bulk-update multiple at once with `PATCH /api/v1/applications/<app-uuid>/envs`. Setting env vars **does not auto-redeploy** — trigger a deploy in Step 4 once you're done.

List existing vars with `GET /api/v1/applications/<app-uuid>/envs` before adding, so you don't create duplicates (Coolify will reject a duplicate key).

# Step 4 — Trigger a deploy and watch it

Trigger:

```bash
curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "$COOLIFY_BASE_URL/api/v1/deploy?uuid=<app-uuid>"
```

Response shape:

```json
{ "deployments": [ { "resource_uuid": "<app-uuid>", "deployment_uuid": "<dep-uuid>", "message": "Deployment queued." } ] }
```

Add `&force=true` to bust the build cache. Pass multiple app UUIDs comma-separated to deploy in a batch.

Poll the deployment until it terminates:

```bash
curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "$COOLIFY_BASE_URL/api/v1/deployments/<dep-uuid>" \
  | jq '{status, current_process_id, created_at, updated_at}'
```

`status` walks through `queued` → `in_progress` → `finished` | `failed` | `cancelled`. Poll every ~5s with a sane cap (say, 20 minutes). When it terminates:

- `finished` — report the new fqdn / open URL.
- `failed` — fetch the log tail (Step 5) and surface the last 40 lines plus any obvious error.
- `cancelled` — note it, ask the user if they want a retry.

Cancel a deploy you no longer want: `POST /api/v1/deployments/<dep-uuid>/cancel`.

# Step 5 — Read logs

Deployment build log (what you usually want after a failure):

```bash
curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "$COOLIFY_BASE_URL/api/v1/deployments/<dep-uuid>" \
  | jq -r '.logs // empty'
```

Runtime container logs:

```bash
curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "$COOLIFY_BASE_URL/api/v1/applications/<app-uuid>/logs?lines=200"
```

When a deploy fails, **don't dump the whole log** — extract the last error block (the chunk after the final `error`/`failed` line) and show that, plus a pointer to the deployment UUID for the user to inspect in the UI if they want more.

# Step 6 — Lifecycle controls

- Restart: `GET /api/v1/applications/<app-uuid>/restart`
- Stop: `GET /api/v1/applications/<app-uuid>/stop`
- Start: `GET /api/v1/applications/<app-uuid>/start`
- Update settings: `PATCH /api/v1/applications/<app-uuid>` with the fields to change (same shape as create — domains, ports, build_pack, health checks, etc.)

# Safety rules — confirm before doing

These actions are destructive or expensive. **Stop and ask the user** before executing, even if their goal seems to imply them:

- `DELETE /api/v1/applications/<uuid>` — removes the app and its history.
- Any database operation: create, delete, restart, restore from backup (`/api/v1/databases/...`). Databases hold state the user cannot recreate from git.
- Stopping a `production`-environment app, even temporarily.
- `force=true` on a deploy of a production app, unless the user explicitly asked for a no-cache rebuild.
- Server-level operations (`/api/v1/servers/<uuid>` mutations) — these affect every app on that host.

For reads — listing, inspecting status, fetching logs — proceed without asking.

# Conventions

- Always use `curl -fsS` so HTTP errors bubble up as non-zero exit codes; pipe to `jq` for human-readable output.
- Set `-H "Content-Type: application/json"` on every body-carrying request.
- Quote the URL — `$COOLIFY_BASE_URL` may contain characters that surprise the shell.
- When the user gives you a name, **echo back the resolved UUID** the first time you use it so they can sanity-check you picked the right one.
- If a call returns 401, the token's been revoked or the abilities are wrong — stop and tell the user to refresh it in Settings.
- If a call returns 422 with field-level errors, surface the field name(s) instead of the raw blob; the user usually only needs to know which field upset the server.

# Final report

When the goal is done, report briefly:

- What you created / deployed (app name + uuid + fqdn).
- Final deployment status.
- Any env vars you set, redacted (`KEY=***`).
- Any unresolved questions (e.g. "I didn't set up a custom domain — Coolify generated `acme-api.<your-wildcard>`. Want me to add one?").

Don't dump the full JSON of every response.
