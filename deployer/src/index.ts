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
  // Custom-domain attach (Cloudflare for SaaS): the zone whose custom_hostnames
  // API we register against, and the Host->slug map the router reads. CF_API_TOKEN
  // must additionally hold "SSL and Certificates: Edit" for the custom_hostnames call.
  CF_ZONE_ID?: string;
  HOST_MAP?: KVNamespace;
};

type DeployBody = { siteId?: string; slug?: string; ref?: string };
type AttachBody = { slug?: string; hostname?: string };

const WORKER_PREFIX = "bizbeecms-cms-";

// Hostname: lowercase DNS label-dotted, no scheme/path. Conservative on purpose —
// it goes straight into the CF API body and the KV key.
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

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

    if (url.pathname === "/attach-domain" && request.method === "POST") {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (!env.DEPLOYER_SECRET || token !== env.DEPLOYER_SECRET) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      return attachDomain(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

/**
 * Register a customer custom hostname (Cloudflare for SaaS) against the
 * bizbeecms.com zone and record Host->slug in the router's KV. CF issues + auto-
 * renews the cert. Returns the DNS records the customer must add at THEIR
 * registrar (CNAME to the fallback origin + a TXT for DV validation), plus the
 * current cert status so the PM can poll.
 *
 * Idempotent: re-attaching an already-registered hostname returns its existing
 * record rather than erroring, so the PM can safely retry.
 */
async function attachDomain(request: Request, env: Env): Promise<Response> {
  if (!env.CF_ZONE_ID || !env.HOST_MAP) {
    return Response.json({ error: "notConfigured" }, { status: 503 });
  }

  let body: AttachBody;
  try {
    body = (await request.json()) as AttachBody;
  } catch {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").trim();
  const hostname = String(body.hostname ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !HOSTNAME_RE.test(hostname)) {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }

  const api = `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/custom_hostnames`;
  const cfHeaders = {
    Authorization: `Bearer ${env.CF_API_TOKEN}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(api, {
    method: "POST",
    headers: cfHeaders,
    body: JSON.stringify({
      hostname,
      ssl: { method: "txt", type: "dv" },
    }),
  });
  const json = (await res.json()) as {
    success: boolean;
    result?: CfCustomHostname;
    errors?: { code: number; message: string }[];
  };

  let record = json.result;
  if (!json.success) {
    // 1406 = hostname already exists on this zone → fetch and reuse it.
    const dup = json.errors?.some((e) => e.code === 1406);
    if (!dup) {
      return Response.json(
        { error: "cfError", detail: json.errors?.slice(0, 3) },
        { status: 502 },
      );
    }
    const look = await fetch(`${api}?hostname=${encodeURIComponent(hostname)}`, {
      headers: cfHeaders,
    });
    const lookJson = (await look.json()) as {
      success: boolean;
      result?: CfCustomHostname[];
    };
    record = lookJson.result?.[0];
    if (!record) {
      return Response.json({ error: "cfLookupFailed" }, { status: 502 });
    }
  }

  // Record the route mapping so the router can resolve this Host to the Site.
  await env.HOST_MAP.put(hostname, slug);

  return Response.json({
    ok: true,
    hostname,
    slug,
    status: record?.status ?? "pending",
    ssl: record?.ssl?.status ?? "pending",
    // What the customer adds at their registrar. Apex domains that can't CNAME
    // use an A record to CF's anycast IPs instead — the PM UI shows both.
    dns: {
      cname: { name: hostname, value: "cf.bizbeecms.com" },
      txt: record?.ssl?.txt_name
        ? { name: record.ssl.txt_name, value: record.ssl.txt_value }
        : null,
    },
  });
}

type CfCustomHostname = {
  id: string;
  hostname: string;
  status: string;
  ssl?: {
    status?: string;
    txt_name?: string;
    txt_value?: string;
  };
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
      // Per-step audit-trail ingest (deploy-audit-trail): best-effort POSTs of
      // started/ok/failed events for each step. Same origin + DEPLOYER_SECRET
      // as the final callback; empty string = no emit (script no-ops on it).
      EVENTS_URL: env.PM_CALLBACK_ORIGIN
        ? `${env.PM_CALLBACK_ORIGIN.replace(/\/+$/, "")}/api/deploy-events`
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
    # Include the tail of the build log so the failure is self-explanatory in PM,
    # not just a step name. JSON-escape: strip quotes/newlines/backslashes/tabs.
    tail_log=$(tail -n 25 /workspace/build.log 2>/dev/null | tr '"\\\\\\n\\t' '    ' | cut -c1-1500)
    err=$(printf '%s' "\${2:-}" | tr '"\\n' '  ' | cut -c1-200)
    body="{\\"siteId\\":\\"$SITE_ID\\",\\"status\\":\\"failed\\",\\"error\\":\\"$err\\",\\"log\\":\\"$tail_log\\"}"
  fi
  curl -sS -X POST "$CALLBACK_URL" \
    -H "Authorization: Bearer $DEPLOYER_SECRET" \
    -H "Content-Type: application/json" \
    --data "$body" || true
}

# --- Per-step audit trail (deploy-audit-trail) -----------------------------
# Best-effort, NEVER fatal — mirrors report() exactly (curl ... || true). The
# ingest contract (validated by PM parseDeployEvent, which coerces these quoted
# shell strings to ints): {siteId, step, status, startedAt, durationMs?, error?}.
# STEP_NAME/STEP_START_MS are module-level shell state set by step_start so the
# matching step_ok/step_fail can compute durationMs without repeating the name.
STEP_NAME=""
STEP_START_MS=0

emit_event() {
  # $1=step $2=status(started|ok|failed) $3=optional startedAt(ms) $4=optional durationMs $5=optional error
  if [ -z "$EVENTS_URL" ]; then return; fi
  local extra=""
  if [ -n "\${3:-}" ]; then extra="$extra,\\"startedAt\\":\\"$3\\""; fi
  if [ -n "\${4:-}" ]; then extra="$extra,\\"durationMs\\":\\"$4\\""; fi
  if [ -n "\${5:-}" ]; then
    local e
    e=$(printf '%s' "$5" | tr '"\\n' '  ' | cut -c1-200)
    extra="$extra,\\"error\\":\\"$e\\""
  fi
  local body="{\\"siteId\\":\\"$SITE_ID\\",\\"step\\":\\"$1\\",\\"status\\":\\"$2\\"$extra}"
  curl -sS -X POST "$EVENTS_URL" \
    -H "Authorization: Bearer $DEPLOYER_SECRET" \
    -H "Content-Type: application/json" \
    --data "$body" || true
}

now_ms() { date +%s%3N; }

step_start() {
  # $1=step name. Records start time + emits a started event.
  STEP_NAME="$1"
  STEP_START_MS=$(now_ms)
  emit_event "$STEP_NAME" started "$STEP_START_MS"
}

step_ok() {
  emit_event "$STEP_NAME" ok "$STEP_START_MS" "$(( $(now_ms) - STEP_START_MS ))"
}

step_fail() {
  # $1=optional error text. Emits the failed event for the in-flight step.
  emit_event "$STEP_NAME" failed "$STEP_START_MS" "$(( $(now_ms) - STEP_START_MS ))" "\${1:-}"
}
# ----------------------------------------------------------------------------

run() {
  echo "+ $*"
  if ! "$@"; then
    report failed "step failed: $1"
    exit 1
  fi
}

set +e

# Capture all build output to a logfile so a failing step's REAL error (not just
# its name) can be sent back in the callback. tee keeps it on the container's
# stdout too (visible via the Sandbox process logs).
exec > >(tee /workspace/build.log) 2>&1

rm -rf /workspace/src

step_start clone
# Auth the private clone via a git config Authorization header sourced from env,
# so the token never appears in argv/ps or the stored remote URL. GIT_CONFIG_*
# lets git read config keys from the environment (value is pre-expanded here).
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="http.extraHeader"
export GIT_CONFIG_VALUE_0="Authorization: Basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\\n')"
git clone --depth 1 --branch "$REF" "$REPO_URL" /workspace/src
clone_rc=$?
unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
if [ $clone_rc -ne 0 ]; then step_fail "git clone failed"; report failed "git clone failed"; exit 1; fi
step_ok

cd /workspace/src/CMS || { report failed "CMS dir missing"; exit 1; }

step_start npm
npm ci || npm install
if [ $? -ne 0 ]; then step_fail "npm install failed"; report failed "npm install failed"; exit 1; fi
step_ok

step_start build
npx opennextjs-cloudflare build
if [ $? -ne 0 ]; then step_fail "opennext build failed"; report failed "opennext build failed"; exit 1; fi
step_ok

# --- Per-Site infra provisioning (idempotent) -------------------------------
# Each Site gets its OWN D1 + R2 bucket (the DB/bucket IS the Site boundary).
# CMS/wrangler.jsonc ships placeholder bindings (zero-id D1, generic bucket);
# wrangler REJECTS the upload against those, so we create the real resources and
# patch the (ephemeral, cloned) wrangler.jsonc with their identifiers before
# deploy. $SLUG is regex-validated in the Worker (^[a-z0-9](-[a-z0-9])*$), so it
# is shell-safe to interpolate into resource names.
DB_NAME="bizbeecms-cms-$SLUG"
BUCKET_NAME="bizbeecms-cms-media-$SLUG"

step_start provision
# D1: create if absent, then resolve its id (create is not idempotent — it errors
# if the db exists — so we always read the id back from \`d1 info\`).
npx wrangler d1 create "$DB_NAME" >/dev/null 2>&1 || true
DB_ID=$(npx wrangler d1 info "$DB_NAME" --json 2>/dev/null | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
if [ -z "$DB_ID" ]; then step_fail "d1 provision failed for $DB_NAME"; report failed "d1 provision failed for $DB_NAME"; exit 1; fi

# R2: create if absent (errors harmlessly if it already exists).
npx wrangler r2 bucket create "$BUCKET_NAME" >/dev/null 2>&1 || true
step_ok

# Patch the cloned CMS/wrangler.jsonc: real D1 id + per-Site bucket name. The
# placeholders are fixed known strings, so a literal substitution is safe.
sed -i "s/00000000-0000-0000-0000-000000000000/$DB_ID/" wrangler.jsonc
sed -i "s/\\"bucket_name\\": \\"bizbeecms-cms-media\\"/\\"bucket_name\\": \\"$BUCKET_NAME\\"/" wrangler.jsonc

# Apply CMS migrations to the (now real) per-Site D1. Use the BINDING name "DB"
# (not $DB_NAME) — \`migrations apply\` resolves the target from wrangler.jsonc,
# which we just patched with the real id; the generic database_name doesn't match
# the per-Site db, but the DB binding now points at it.
step_start migrate
npx wrangler d1 migrations apply DB --remote
if [ $? -ne 0 ]; then step_fail "d1 migrations failed for $DB_NAME"; report failed "d1 migrations failed for $DB_NAME"; exit 1; fi
step_ok
# ----------------------------------------------------------------------------

# Inject the Sec1 CMS admin-auth vars (SITE_ID lets the guard run PM's reach
# check; PM_ORIGIN/CMS_AUTH_SECRET let it CALL PM). --var sets plain Worker vars,
# overriding the empty placeholders in CMS/wrangler.jsonc. Values come from the
# process env (never inlined), so nothing caller-controlled reaches the shell.
# The D1/R2 bindings now come from the patched wrangler.jsonc above.
step_start deploy
npx wrangler deploy --name "$WORKER_NAME" --compatibility-date 2025-09-01 \
  --var "SITE_ID:$SITE_ID" \
  --var "PM_ORIGIN:$PM_ORIGIN" \
  --var "CMS_AUTH_SECRET:$CMS_AUTH_SECRET"
if [ $? -ne 0 ]; then step_fail "wrangler deploy failed"; report failed "wrangler deploy failed"; exit 1; fi
step_ok

report deployed
echo "DONE"
`;
}
