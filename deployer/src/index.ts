import { getSandbox, type Sandbox } from "@cloudflare/sandbox";

// Required re-export: the Sandbox Durable Object class the container runs in.
export { Sandbox } from "@cloudflare/sandbox";

type Env = {
  Sandbox: DurableObjectNamespace<Sandbox>;
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  DEPLOYER_SECRET: string;
  REPO_URL: string;
  GITHUB_TOKEN?: string;
  PM_CALLBACK_ORIGIN?: string;
  // CMS admin-auth bridge (Sec1): injected into each deployed CMS Worker as
  // plain Worker vars so its requireAdmin guard can call PM's cms-validate.
  // CMS_AUTH_SECRET is the shared bearer PM checks; PM_ORIGIN is where
  // /api/auth/cms-validate lives (falls back to PM_CALLBACK_ORIGIN).
  CMS_AUTH_SECRET?: string;
  PM_ORIGIN?: string;
};

type DeployBody = { siteId?: string; slug?: string; ref?: string };

const WORKER_PREFIX = "bizbeecms-cms-";

/**
 * bizbeecms-deployer — a standalone Worker that owns an on-demand build
 * container (the Sandbox DO). The PM calls `POST /deploy` with a Site slug; the
 * container clones the repo, runs the REAL `opennextjs-cloudflare build` +
 * `wrangler deploy` for that Site's CMS Worker (the same path that deploys the
 * PM, so bundling + assets + bindings all work), then POSTs the result back to
 * the PM.
 *
 * Execution model: a CMS build takes minutes — far longer than a Worker request
 * (or ctx.waitUntil) survives. So we DON'T orchestrate each step from the
 * Worker. Instead we write a single self-contained build script into the
 * container and launch it with `startProcess` (a detached background process in
 * the container). The script does clone → build → deploy → curl the PM callback
 * itself, running to completion independently of this request. The Worker
 * returns immediately.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/deploy" && request.method === "POST") {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (!env.DEPLOYER_SECRET || token !== env.DEPLOYER_SECRET) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      let body: DeployBody;
      try {
        body = (await request.json()) as DeployBody;
      } catch {
        return Response.json({ error: "badRequest" }, { status: 400 });
      }

      const slug = String(body.slug ?? "").trim();
      const siteId = String(body.siteId ?? "").trim();
      const ref =
        body.ref && /^[\w.\-/]+$/.test(body.ref) ? body.ref : "main";
      if (
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        !/^[A-Za-z0-9_-]+$/.test(siteId)
      ) {
        return Response.json({ error: "badRequest" }, { status: 400 });
      }

      try {
        await startDeploy(env, { siteId, slug, ref });
      } catch (err) {
        return Response.json(
          { error: "startFailed", detail: String(err).slice(0, 200) },
          { status: 502 },
        );
      }
      return Response.json({ accepted: true, slug });
    }

    return new Response("Not found", { status: 404 });
  },
};

/**
 * Write the build script into a fresh container and launch it detached. The
 * script self-reports to the PM callback on exit (success or failure), so the
 * Worker doesn't need to wait. Returns once the process is started.
 */
async function startDeploy(
  env: Env,
  input: { siteId: string; slug: string; ref: string },
): Promise<void> {
  const workerName = `${WORKER_PREFIX}${input.slug}`.slice(0, 63);
  const sandbox = getSandbox(env.Sandbox, `deploy-${input.slug}`);

  // The script is fully STATIC — no caller-controlled value is interpolated
  // into it. Everything (secrets AND the non-secret per-deploy values) is
  // passed via the process env and referenced as $VARS, so nothing can break
  // out of the shell or land in the script file. See buildScript().
  await sandbox.writeFile("/workspace/deploy.sh", buildScript());
  await sandbox.startProcess("bash /workspace/deploy.sh", {
    env: {
      GITHUB_TOKEN: env.GITHUB_TOKEN ?? "",
      CLOUDFLARE_API_TOKEN: env.CF_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: env.CF_ACCOUNT_ID,
      DEPLOYER_SECRET: env.DEPLOYER_SECRET,
      REPO_URL: env.REPO_URL,
      REF: input.ref,
      WORKER_NAME: workerName,
      SLUG: input.slug,
      SITE_ID: input.siteId,
      CALLBACK_URL: env.PM_CALLBACK_ORIGIN
        ? `${env.PM_CALLBACK_ORIGIN.replace(/\/+$/, "")}/api/deploy-callback`
        : "",
      // Sec1 CMS admin-auth wiring → injected into the CMS Worker as vars.
      CMS_AUTH_SECRET: env.CMS_AUTH_SECRET ?? "",
      // The CMS guard calls PM at PM_ORIGIN; default to the callback origin.
      PM_ORIGIN: (env.PM_ORIGIN ?? env.PM_CALLBACK_ORIGIN ?? "").replace(/\/+$/, ""),
    },
  });
}

/**
 * The self-contained build script. Fully STATIC — every value it needs
 * (secrets AND the per-deploy values SITE_ID/WORKER_NAME/CALLBACK_URL/REF/
 * REPO_URL) is supplied via the process env and referenced as $VARS, never
 * inlined. Nothing caller-controlled is interpolated into this string, so
 * there is no shell-injection surface. Always POSTs a status callback to the
 * PM on exit. Auth for the private clone goes through an Authorization header
 * from $GITHUB_TOKEN, so the token never appears in argv or the remote URL.
 */
function buildScript(): string {
  return `#!/usr/bin/env bash
set -uo pipefail

report() {
  # $1=status (deployed|failed) ; $2=optional error
  if [ -z "$CALLBACK_URL" ]; then return; fi
  if [ "$1" = "deployed" ]; then
    body="{\\"siteId\\":\\"$SITE_ID\\",\\"status\\":\\"deployed\\",\\"workerName\\":\\"$WORKER_NAME\\"}"
  else
    # keep error short + JSON-safe
    err=$(printf '%s' "\${2:-}" | tr '"\\n' '  ' | cut -c1-300)
    body="{\\"siteId\\":\\"$SITE_ID\\",\\"status\\":\\"failed\\",\\"error\\":\\"$err\\"}"
  fi
  curl -sS -X POST "$CALLBACK_URL" \
    -H "Authorization: Bearer $DEPLOYER_SECRET" \
    -H "Content-Type: application/json" \
    --data "$body" || true
}

run() {
  echo "+ $*"
  if ! "$@"; then
    report failed "step failed: $1"
    exit 1
  fi
}

set +e
rm -rf /workspace/src

# Auth the private clone via a git config Authorization header sourced from env,
# so the token never appears in argv/ps or the stored remote URL. GIT_CONFIG_*
# lets git read config keys from the environment (value is pre-expanded here).
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="http.extraHeader"
export GIT_CONFIG_VALUE_0="Authorization: Basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\\n')"
git clone --depth 1 --branch "$REF" "$REPO_URL" /workspace/src
clone_rc=$?
unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
if [ $clone_rc -ne 0 ]; then report failed "git clone failed"; exit 1; fi

cd /workspace/src/CMS || { report failed "CMS dir missing"; exit 1; }

npm ci || npm install
if [ $? -ne 0 ]; then report failed "npm install failed"; exit 1; fi

npx opennextjs-cloudflare build
if [ $? -ne 0 ]; then report failed "opennext build failed"; exit 1; fi

# --- Per-Site infra provisioning (idempotent) -------------------------------
# Each Site gets its OWN D1 + R2 bucket (the DB/bucket IS the Site boundary).
# CMS/wrangler.jsonc ships placeholder bindings (zero-id D1, generic bucket);
# wrangler REJECTS the upload against those, so we create the real resources and
# patch the (ephemeral, cloned) wrangler.jsonc with their identifiers before
# deploy. $SLUG is regex-validated in the Worker (^[a-z0-9](-[a-z0-9])*$), so it
# is shell-safe to interpolate into resource names.
DB_NAME="bizbeecms-cms-$SLUG"
BUCKET_NAME="bizbeecms-cms-media-$SLUG"

# D1: create if absent, then resolve its id (create is not idempotent — it errors
# if the db exists — so we always read the id back from \`d1 info\`).
npx wrangler d1 create "$DB_NAME" >/dev/null 2>&1 || true
DB_ID=$(npx wrangler d1 info "$DB_NAME" --json 2>/dev/null | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
if [ -z "$DB_ID" ]; then report failed "d1 provision failed for $DB_NAME"; exit 1; fi

# R2: create if absent (errors harmlessly if it already exists).
npx wrangler r2 bucket create "$BUCKET_NAME" >/dev/null 2>&1 || true

# Patch the cloned CMS/wrangler.jsonc: real D1 id + per-Site bucket name. The
# placeholders are fixed known strings, so a literal substitution is safe.
sed -i "s/00000000-0000-0000-0000-000000000000/$DB_ID/" wrangler.jsonc
sed -i "s/\\"bucket_name\\": \\"bizbeecms-cms-media\\"/\\"bucket_name\\": \\"$BUCKET_NAME\\"/" wrangler.jsonc

# Apply CMS migrations to the (now real) per-Site D1. Use the BINDING name "DB"
# (not $DB_NAME) — \`migrations apply\` resolves the target from wrangler.jsonc,
# which we just patched with the real id; the generic database_name doesn't match
# the per-Site db, but the DB binding now points at it.
npx wrangler d1 migrations apply DB --remote
if [ $? -ne 0 ]; then report failed "d1 migrations failed for $DB_NAME"; exit 1; fi
# ----------------------------------------------------------------------------

# Inject the Sec1 CMS admin-auth vars (SITE_ID lets the guard run PM's reach
# check; PM_ORIGIN/CMS_AUTH_SECRET let it CALL PM). --var sets plain Worker vars,
# overriding the empty placeholders in CMS/wrangler.jsonc. Values come from the
# process env (never inlined), so nothing caller-controlled reaches the shell.
# The D1/R2 bindings now come from the patched wrangler.jsonc above.
npx wrangler deploy --name "$WORKER_NAME" --compatibility-date 2025-09-01 \
  --var "SITE_ID:$SITE_ID" \
  --var "PM_ORIGIN:$PM_ORIGIN" \
  --var "CMS_AUTH_SECRET:$CMS_AUTH_SECRET"
if [ $? -ne 0 ]; then report failed "wrangler deploy failed"; exit 1; fi

report deployed
echo "DONE"
`;
}
