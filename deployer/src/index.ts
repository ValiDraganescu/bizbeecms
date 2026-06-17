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
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !siteId) {
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

  const script = buildScript({
    repoUrl: env.REPO_URL,
    ref: input.ref,
    workerName,
    siteId: input.siteId,
    callbackUrl: env.PM_CALLBACK_ORIGIN
      ? `${env.PM_CALLBACK_ORIGIN.replace(/\/+$/, "")}/api/deploy-callback`
      : "",
  });

  // Write the script + run it detached. Secrets are passed via the process env
  // (never interpolated into the script text), so they don't land in the file,
  // argv, or any log.
  await sandbox.writeFile("/workspace/deploy.sh", script);
  await sandbox.startProcess("bash /workspace/deploy.sh", {
    env: {
      GITHUB_TOKEN: env.GITHUB_TOKEN ?? "",
      CLOUDFLARE_API_TOKEN: env.CF_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: env.CF_ACCOUNT_ID,
      DEPLOYER_SECRET: env.DEPLOYER_SECRET,
    },
  });
}

/**
 * The self-contained build script. Runs in the container with secrets supplied
 * via env (referenced as $VARS, never inlined). Always POSTs a status callback
 * to the PM on exit. Auth for the private clone goes through an Authorization
 * header from $GITHUB_TOKEN, so the token never appears in argv or the remote
 * URL.
 */
function buildScript(p: {
  repoUrl: string;
  ref: string;
  workerName: string;
  siteId: string;
  callbackUrl: string;
}): string {
  // Note: values below (repoUrl, ref, workerName, siteId, callbackUrl) are
  // server-controlled and already validated; they are NOT secrets.
  return `#!/usr/bin/env bash
set -uo pipefail

SITE_ID="${p.siteId}"
WORKER_NAME="${p.workerName}"
CALLBACK_URL="${p.callbackUrl}"

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
git clone --depth 1 --branch "${p.ref}" "${p.repoUrl}" /workspace/src
clone_rc=$?
unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
if [ $clone_rc -ne 0 ]; then report failed "git clone failed"; exit 1; fi

cd /workspace/src/CMS || { report failed "CMS dir missing"; exit 1; }

npm ci || npm install
if [ $? -ne 0 ]; then report failed "npm install failed"; exit 1; fi

npx opennextjs-cloudflare build
if [ $? -ne 0 ]; then report failed "opennext build failed"; exit 1; fi

npx wrangler deploy --name "$WORKER_NAME" --compatibility-date 2025-09-01
if [ $? -ne 0 ]; then report failed "wrangler deploy failed"; exit 1; fi

report deployed
echo "DONE"
`;
}
