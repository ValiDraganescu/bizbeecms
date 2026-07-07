# Creating a new app from a Git repo

Primary endpoint (private repo via the configured GitHub App): `POST /api/v1/applications/private-github-app`.

Required body fields:
- `project_uuid` — from the Step 1 lookup
- `server_uuid` — from the Step 1 lookup
- `environment_name` — usually `production` (or `environment_uuid` if you already have it)
- `github_app_uuid` — the configured GitHub App
- `git_repository` — `owner/repo` (e.g. `acme/api`)
- `git_branch` — e.g. `main`
- `name` — human-readable app name

Common optional fields to set explicitly rather than rely on defaults:
- `build_pack` — `nixpacks` (default), `dockerfile`, `dockercompose`, or `static`
- `ports_exposes` — the container's listening port (e.g. `"3000"`); Coolify uses this to wire its proxy
- `domains` — comma-separated FQDNs, OR
- `autogenerate_domain: true` — let Coolify mint a `*.sslip.io`/configured-wildcard hostname
- `instant_deploy: true` — dispatch the first deployment job immediately
- `is_auto_deploy_enabled: true` — redeploy on push (requires the GitHub App webhook configured at Coolify's URL)
- `health_check_enabled: true` + `health_check_path: "/healthz"` if the app exposes one
- For Dockerfile builds: `dockerfile_location` (path inside the repo) and optionally `base_directory`
- For Compose builds: `docker_compose_location`

Example:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  "$COOLIFY_BASE_URL/api/v1/applications/private-github-app" \
  -d @- <<'JSON'
{
  "project_uuid":     "<project-uuid>",
  "server_uuid":      "<server-uuid>",
  "environment_name": "production",
  "github_app_uuid":  "<github-app-uuid>",
  "git_repository":   "acme/api",
  "git_branch":       "main",
  "name":             "acme-api",
  "build_pack":       "nixpacks",
  "ports_exposes":    "3000",
  "autogenerate_domain": true,
  "instant_deploy":   true,
  "is_auto_deploy_enabled": true
}
JSON
```

The response includes the new application `uuid` — **save it**; you need it for env vars and deploy polling.

Sibling endpoints exist for the other Git auth modes. Use them only if the user asks:
- `POST /api/v1/applications/public` — public repo, no creds
- `POST /api/v1/applications/private-deploy-key` — SSH deploy key (use when there's no GitHub App)
- `POST /api/v1/applications/dockerfile` — paste a Dockerfile inline (no Git)
- `POST /api/v1/applications/dockerimage` — pull a prebuilt image
- `POST /api/v1/applications/dockercompose` — paste a compose file inline
