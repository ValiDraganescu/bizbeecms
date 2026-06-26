import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
import { chooseAppOrigin } from "./origin-core";

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
  // AI provider key (ai-openrouter): injected into each CMS Worker as a var so
  // getAi() selects OpenRouter. Empty/absent => CMS falls back to the CF `AI`
  // binding. Set as a deployer secret (`wrangler secret put OPENROUTER_API_KEY`).
  OPENROUTER_API_KEY?: string;
  // Custom-domain attach (Cloudflare for SaaS): the zone whose custom_hostnames
  // API we register against, and the Host->slug map the router reads. CF_API_TOKEN
  // must additionally hold "SSL and Certificates: Edit" for the custom_hostnames call.
  CF_ZONE_ID?: string;
  HOST_MAP?: KVNamespace;
  // Hard ceiling (seconds) on a single build+deploy run. A stalled build (hung
  // wrangler prompt, frozen npm, OOM-thrash) otherwise keeps the standard-1
  // instance AWAKE indefinitely — memory+disk bill on wall-clock, not CPU, so an
  // unkilled 7h stall cost ~30x a real 6min build (observed Jun 2026). The build
  // script re-execs itself under coreutils `timeout`; on expiry it SIGKILLs and
  // the EXIT trap reports `failed` to PM so the instance exits. PM sends a
  // per-deploy override in the body; this is the fallback default. 720s = 12min.
  BUILD_TIMEOUT_SEC?: string;
};

// Default build timeout (seconds) when neither the PM body nor the deployer env
// supplies one. A real CMS build is ~6min; 12min leaves generous headroom.
const DEFAULT_BUILD_TIMEOUT_SEC = 720;

/**
 * Resolve the effective build timeout in seconds. Precedence: per-deploy value
 * from the PM body → deployer env BUILD_TIMEOUT_SEC → DEFAULT. Anything that
 * isn't a positive finite integer is ignored (falls through). Pure — unit-tested.
 */
export function resolveBuildTimeoutSec(
  fromBody: number | undefined | null,
  fromEnv: string | undefined | null,
): number {
  const cand = [fromBody, fromEnv != null ? Number(fromEnv) : undefined];
  for (const v of cand) {
    if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  }
  return DEFAULT_BUILD_TIMEOUT_SEC;
}

type DeployBody = {
  siteId?: string;
  slug?: string;
  ref?: string;
  // The site's primary public origin (its custom domain as `https://<host>`)
  // when one is attached. PM derives it from the newest non-redirect custom
  // domain; absent → the deployer uses the workers.dev URL. Threaded into the
  // CMS Worker as APP_ORIGIN (MCP URL + trusted links). See chooseAppOrigin().
  appOrigin?: string;
  // Per-Site OpenRouter key (ai-openrouter Slice 4): plaintext, present ONLY
  // when the Site has its own key that PM decrypted cleanly. Set as the CMS
  // Worker SECRET OPENROUTER_API_KEY; absent → fall back to the deployer global.
  openrouterApiKey?: string;
  // Hard build-run ceiling (seconds) for THIS deploy. PM computes it from its
  // global + per-Site settings; absent → deployer falls back to BUILD_TIMEOUT_SEC
  // env, then DEFAULT_BUILD_TIMEOUT_SEC. See resolveBuildTimeoutSec().
  buildTimeoutSec?: number;
};
type AttachBody = {
  slug?: string;
  hostname?: string;
  // Optional: make this hostname a REDIRECT (301) to an absolute https URL
  // instead of serving the Site. Used for apex→www. Still registers a CF custom
  // hostname (cert) so the redirect host reaches our edge; only the HOST_MAP
  // value differs (">"+url instead of the slug).
  redirectTo?: string;
};

// --- Cloudflare config constants (deployer's source of truth) ---
// PM has its own copy in ProjectManager/src/lib/config/hosts.ts (separate package,
// can't share an import). Keep the two in sync — both are documented in
// DEPLOY-ARCHITECTURE.md § "Config & magic-value inventory".
const WORKER_PREFIX = "bizbeecms-cms-";
// Our Cloudflare account's workers.dev subdomain; every deployed CMS Worker is
// reachable at `https://<worker-name>.<this>.workers.dev`. Mirrors PM's
// ACCOUNT_WORKERS_SUBDOMAIN in ProjectManager/src/lib/config/hosts.ts — keep in
// sync. Used to compute the CMS's own public origin (APP_ORIGIN) for building
// trusted invite-accept links (cms-auth Slice 4).
const WORKERS_DEV_SUFFIX = ".vali-draganescu88.workers.dev";
// Fallback-origin CNAME target customers point their domain at (router serves it).
const CUSTOM_DOMAIN_FALLBACK_ORIGIN = "cf.bizbeecms.com";
// CF anycast IPs for apex domains that can't CNAME — handed to the customer as A records.
const CUSTOM_DOMAIN_APEX_IPS = ["104.21.34.242", "172.67.210.25"];

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

      // Per-Site OpenRouter key: plaintext from PM, present only sometimes.
      const perSiteOpenrouterKey =
        typeof body.openrouterApiKey === "string"
          ? body.openrouterApiKey
          : undefined;

      // Per-deploy build timeout from PM (max of global+per-Site, in seconds).
      // Non-numbers fall through to the env/default in resolveBuildTimeoutSec.
      const bodyTimeout =
        typeof body.buildTimeoutSec === "number"
          ? body.buildTimeoutSec
          : undefined;

      // Site's primary public origin (custom domain), validated in chooseAppOrigin.
      const appOrigin =
        typeof body.appOrigin === "string" ? body.appOrigin : undefined;

      try {
        await startDeploy(env, {
          siteId,
          slug,
          ref,
          openrouterApiKey: perSiteOpenrouterKey,
          buildTimeoutSec: bodyTimeout,
          appOrigin,
        });
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

  // Optional redirect: validate it's an https URL whose host is a clean hostname
  // (the router 301s to it verbatim, so reject anything that isn't a plain
  // https origin — no open-redirect surface from a malformed value).
  let redirectTo: string | null = null;
  if (body.redirectTo != null && String(body.redirectTo).trim() !== "") {
    try {
      const u = new URL(String(body.redirectTo).trim());
      if (u.protocol !== "https:" || !HOSTNAME_RE.test(u.hostname)) {
        return Response.json({ error: "badRequest" }, { status: 400 });
      }
      redirectTo = `https://${u.hostname}`;
    } catch {
      return Response.json({ error: "badRequest" }, { status: 400 });
    }
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

  // Record the route mapping so the router can resolve this Host. A redirect host
  // stores "><target>" (router 301s it); a serving host stores the bare slug.
  await env.HOST_MAP.put(hostname, redirectTo ? `>${redirectTo}` : slug);

  // CF returns DV records under ssl.validation_records[] (and a one-CNAME DCV
  // delegation under ssl.dcv_delegation_records[]); some responses also carry the
  // legacy top-level ssl.txt_name. Gather the TXT records from both shapes.
  const ssl = record?.ssl;
  const txt = [
    ...(ssl?.txt_name && ssl.txt_value
      ? [{ name: ssl.txt_name, value: ssl.txt_value }]
      : []),
    ...(ssl?.validation_records ?? [])
      .filter((v) => v.txt_name && v.txt_value)
      .map((v) => ({ name: v.txt_name as string, value: v.txt_value as string })),
  ];
  const dcv = (ssl?.dcv_delegation_records ?? [])
    .filter((d) => d.cname && d.cname_target)
    .map((d) => ({ name: d.cname as string, value: d.cname_target as string }));

  return Response.json({
    ok: true,
    hostname,
    slug,
    redirectTo,
    status: record?.status ?? "pending",
    ssl: ssl?.status ?? "pending",
    // Every record the customer might add at their registrar:
    //  - routing: CNAME the hostname to the fallback origin (or A for an apex).
    //  - dcv: ONE CNAME that delegates cert validation + renewal to CF (best).
    //  - txt: _acme-challenge TXT(s) — the alternative DV method.
    dns: {
      // Subdomain → CNAME; apex → A record to CF anycast (can't CNAME an apex).
      routing: {
        cname: { name: hostname, value: CUSTOM_DOMAIN_FALLBACK_ORIGIN },
        apexA: { name: hostname, values: CUSTOM_DOMAIN_APEX_IPS },
      },
      dcv: dcv[0] ?? null,
      txt,
    },
  });
}

type CfCustomHostname = {
  id: string;
  hostname: string;
  status: string;
  ssl?: {
    status?: string;
    // Legacy top-level DV fields — present on some CF responses.
    txt_name?: string;
    txt_value?: string;
    // The real location of DV records on current CF responses.
    validation_records?: {
      txt_name?: string;
      txt_value?: string;
      http_url?: string;
      http_body?: string;
    }[];
    // DCV delegation: ONE CNAME the customer adds so CF manages validation +
    // renewal automatically (the recommended method).
    dcv_delegation_records?: { cname?: string; cname_target?: string }[];
  };
};

/**
 * Write the build script into a fresh container and launch it detached. The
 * script self-reports to the PM callback on exit (success or failure), so the
 * Worker doesn't need to wait. Returns once the process is started.
 */
/**
 * Pick the effective OPENROUTER_API_KEY for a deploy and whether to set it as a
 * Worker secret. Per-Site body key wins; else the deployer's own global; else
 * empty (CMS then falls back to Workers AI). Only set the secret when non-empty
 * (don't overwrite a real secret with a blank). Pure — unit-tested.
 */
export function effectiveOpenrouterKey(
  perSite: string | undefined | null,
  global: string | undefined | null,
): { key: string; setSecret: boolean } {
  const key = (perSite && perSite.length > 0 ? perSite : global) ?? "";
  return { key, setSecret: key.length > 0 };
}

async function startDeploy(
  env: Env,
  input: {
    siteId: string;
    slug: string;
    ref: string;
    openrouterApiKey?: string;
    buildTimeoutSec?: number;
    appOrigin?: string;
  },
): Promise<void> {
  const workerName = `${WORKER_PREFIX}${input.slug}`.slice(0, 63);
  const sandbox = getSandbox(env.Sandbox, `deploy-${input.slug}`);
  const buildTimeoutSec = resolveBuildTimeoutSec(
    input.buildTimeoutSec,
    env.BUILD_TIMEOUT_SEC,
  );
  // One id per deploy invocation, like SITE_ID — every per-step emit AND the
  // final callback carry it so the timeline can isolate a single run's events.
  const deployId = crypto.randomUUID();

  // The script is fully STATIC — no caller-controlled value is interpolated
  // into it. Everything (secrets AND the non-secret per-deploy values) is
  // passed via the process env and referenced as $VARS, so nothing can break
  // out of the shell or land in the script file. See buildScript().
  await sandbox.writeFile("/workspace/deploy.sh", buildScript());
  await sandbox.startProcess("bash /workspace/deploy.sh", {
    env: {
      // Force wrangler non-interactive. The build script runs DETACHED (no TTY);
      // any wrangler prompt (deploy confirmation, first-run subdomain, D1
      // availability) would block FOREVER waiting for input it can never get —
      // observed: `wrangler deploy` hung ~10min with the step stuck at "started".
      // CI=true makes wrangler skip prompts / use defaults instead of blocking.
      CI: "true",
      WRANGLER_SEND_METRICS: "false",
      GITHUB_TOKEN: env.GITHUB_TOKEN ?? "",
      CLOUDFLARE_API_TOKEN: env.CF_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: env.CF_ACCOUNT_ID,
      DEPLOYER_SECRET: env.DEPLOYER_SECRET,
      REPO_URL: env.REPO_URL,
      REF: input.ref,
      WORKER_NAME: workerName,
      SLUG: input.slug,
      SITE_ID: input.siteId,
      DEPLOY_ID: deployId,
      // Hard run ceiling (seconds). The script re-execs itself under `timeout`.
      BUILD_TIMEOUT_SEC: String(buildTimeoutSec),
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
      // The CMS's OWN public origin — used to build trusted invite-accept links
      // (cms-auth) AND the MCP URL the CMS advertises (cms-mcp). Prefer the
      // site's primary custom domain (PM passes it as appOrigin) when attached,
      // else the deployed workers.dev URL. chooseAppOrigin validates the input.
      APP_ORIGIN: chooseAppOrigin(
        input.appOrigin,
        `https://${workerName}${WORKERS_DEV_SUFFIX}`,
      ),
      // AI provider key (ai-openrouter Slice 4): per-Site key (from PM body)
      // wins, else the deployer's own global, else empty. Set as a Worker
      // SECRET below (not a --var) so it never lands in CMS/wrangler.jsonc or a
      // logged command. SET_OPENROUTER_SECRET gates the secret-put (skip blank).
      OPENROUTER_API_KEY: effectiveOpenrouterKey(
        input.openrouterApiKey,
        env.OPENROUTER_API_KEY,
      ).key,
      SET_OPENROUTER_SECRET: effectiveOpenrouterKey(
        input.openrouterApiKey,
        env.OPENROUTER_API_KEY,
      ).setSecret
        ? "1"
        : "",
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

# --- Hard run timeout (anti-stall) ------------------------------------------
# A stalled build (hung wrangler prompt, frozen npm, OOM-thrash) keeps the
# instance AWAKE — and memory+disk bill on wall-clock, not CPU. So bound the
# WHOLE run: re-exec this script once under coreutils \`timeout\`, which SIGTERMs
# the process group at $BUILD_TIMEOUT_SEC (then SIGKILLs 10s later if it ignores
# the term). The SIGTERM trap below reports \`failed\` to PM so the run finalizes
# instead of hanging. BUILD_TIMEOUT_GUARD marks the re-exec so we wrap only once.
if [ -z "\${BUILD_TIMEOUT_GUARD:-}" ]; then
  export BUILD_TIMEOUT_GUARD=1
  # --kill-after gives a real build a chance to flush on TERM before the hard KILL.
  exec timeout --kill-after=10s "\${BUILD_TIMEOUT_SEC:-720}s" bash "$0" "$@"
fi

# Fire on the timeout SIGTERM: tell PM the run was killed for exceeding the cap,
# then exit non-zero. Without this the killed process reports nothing and the
# Site is stuck \`deploying\` until the stuck-detector reaps it.
on_timeout() {
  report failed "build exceeded \${BUILD_TIMEOUT_SEC:-720}s timeout (killed)"
  exit 124
}
trap on_timeout TERM
# ----------------------------------------------------------------------------

report() {
  # $1=status (deployed|failed) ; $2=optional error
  # This is the single terminal funnel for the run, so stop the live log poller
  # here — after this the deploy is resolved and PM prunes the streamed rows
  # (prune-on-resolve). One final flush so the console shows the last lines that
  # landed inside the 2s poll gap (e.g. the actual error of a failing step).
  # Stop the mem sampler FIRST so its last [mem] line is in build.log before the
  # final flush (a timed-out build dies via this path with the sampler running).
  stop_mem_sampler
  flush_log_stream
  stop_log_stream
  if [ -z "$CALLBACK_URL" ]; then return; fi
  if [ "$1" = "deployed" ]; then
    body="{\\"siteId\\":\\"$SITE_ID\\",\\"deployId\\":\\"$DEPLOY_ID\\",\\"status\\":\\"deployed\\",\\"workerName\\":\\"$WORKER_NAME\\",\\"deployedRef\\":\\"$REF\\"}"
  else
    # keep error short + JSON-safe
    # Include the build log so the failure is self-explanatory in PM. A plain
    # tail is useless when esbuild's Go runtime panics — it dumps hundreds of
    # goroutine frames that push the REAL error (the "✘ [ERROR]" / resolve /
    # syntax line) out of the tail. So grep the meaningful error lines FIRST,
    # then append a short tail for context. JSON-escape: strip quotes/newlines/
    # backslashes/tabs.
    err_lines=$(grep -aE '✘|\\[ERROR\\]|Could not resolve|error:|Error:|Unexpected|Cannot find|Module not found|SyntaxError' /workspace/build.log 2>/dev/null | head -n 20)
    tail_lines=$(tail -n 15 /workspace/build.log 2>/dev/null)
    tail_log=$(printf '%s\\n--- tail ---\\n%s' "$err_lines" "$tail_lines" | tr '"\\\\\\n\\t' '    ' | cut -c1-1800)
    err=$(printf '%s' "\${2:-}" | tr '"\\n' '  ' | cut -c1-200)
    body="{\\"siteId\\":\\"$SITE_ID\\",\\"deployId\\":\\"$DEPLOY_ID\\",\\"status\\":\\"failed\\",\\"error\\":\\"$err\\",\\"log\\":\\"$tail_log\\"}"
  fi
  curl -sS -X POST "$CALLBACK_URL" \
    -H "Authorization: Bearer $DEPLOYER_SECRET" \
    -H "Content-Type: application/json" \
    --data "$body" || true
}

# --- Per-step audit trail (deploy-audit-trail) -----------------------------
# Best-effort, NEVER fatal — mirrors report() exactly (curl ... || true). The
# ingest contract (validated by PM parseDeployEvent, which coerces these quoted
# shell strings to ints): {siteId, deployId, step, status, startedAt, durationMs?, error?}.
# STEP_NAME/STEP_START_MS are module-level shell state set by step_start so the
# matching step_ok/step_fail can compute durationMs without repeating the name.
STEP_NAME=""
STEP_START_MS=0
# Set non-empty (by read_ram_mb, around the OOM-prone build step) to attach
# ramAvailableMb to the in-flight step's ok/fail event. Cleared by step_start so
# only the step that explicitly samples it reports a value.
STEP_RAM_MB=""

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
  # ramAvailableMb (nice-to-have): only when a step sampled it. parseDeployEvent
  # coerces the quoted integer string to a number.
  if [ -n "$STEP_RAM_MB" ]; then extra="$extra,\\"ramAvailableMb\\":\\"$STEP_RAM_MB\\""; fi
  local body="{\\"siteId\\":\\"$SITE_ID\\",\\"deployId\\":\\"$DEPLOY_ID\\",\\"step\\":\\"$1\\",\\"status\\":\\"$2\\"$extra}"
  curl -sS -X POST "$EVENTS_URL" \
    -H "Authorization: Bearer $DEPLOYER_SECRET" \
    -H "Content-Type: application/json" \
    --data "$body" || true
}

now_ms() { date +%s%3N; }

# --- Live build-log streaming (deploy-log-stream) ---------------------------
# Tail the growing build.log and POST new content as status:"log" events so PM
# renders a live Vercel-style console. Runs as a background loop for the duration
# of ONE step (the build); stopped via stop_log_stream. Best-effort: a failed
# POST is swallowed (|| true) and never touches the build. PM prunes these rows
# once the deploy resolves (prune-on-resolve), so volume here is fine.
LOG_STREAM_PID=""  # set while the tailer is running
emit_log_chunk() {
  # $1=raw chunk text. JSON-escape (backslash, quote, control chars→space, strip
  # CRs) and cap so one POST body can't balloon. Skips empty chunks.
  [ -z "$EVENTS_URL" ] && return
  local raw="$1"
  [ -z "$raw" ] && return
  # JSON-string-escape the chunk in ONE awk pass: backslash FIRST (so it doesn't
  # double-escape the rest), then quote and tab, with real newlines re-emitted as
  # the two-char \\n escape (NR>1). CRs are stripped. cut caps body size.
  local esc
  esc=$(printf '%s' "$raw" | tr -d '\\r' | awk '
    BEGIN { ORS="" }
    { gsub(/\\\\/, "\\\\\\\\"); gsub(/"/, "\\\\\\""); gsub(/\\t/, "\\\\t");
      if (NR > 1) printf "\\\\n"; printf "%s", \$0 }
  ' | cut -c1-8000)
  # seq + step come from FILES so the poller subshell and the parent's final
  # flush agree (a forked subshell can't see the parent's later STEP_NAME, and
  # its own LOG_SEQ++ wouldn't survive back to the parent). seq increments
  # atomically enough for a single 2s poller + one final flush.
  local seq step
  seq=$(( $(cat "$LOG_SEQ_FILE" 2>/dev/null || echo 0) + 1 ))
  echo "$seq" > "$LOG_SEQ_FILE"
  step=$(cat /workspace/.log_step 2>/dev/null || echo "build")
  local body="{\\"siteId\\":\\"$SITE_ID\\",\\"deployId\\":\\"$DEPLOY_ID\\",\\"step\\":\\"$step\\",\\"status\\":\\"log\\",\\"startedAt\\":\\"$(now_ms)\\",\\"seq\\":\\"$seq\\",\\"logChunk\\":\\"$esc\\"}"
  curl -sS -X POST "$EVENTS_URL" \
    -H "Authorization: Bearer $DEPLOYER_SECRET" \
    -H "Content-Type: application/json" \
    --data "$body" >/dev/null 2>&1 || true
}

# Offset/seq live in FILES, not shell vars, because the poller runs in a
# subshell (its var writes wouldn't survive to the parent's final flush). Both
# the poller and flush_log_stream share these so bytes are sent exactly once and
# seq never collides across them. LOG_SEQ is sourced from the file in emit.
LOG_OFF_FILE=/workspace/.log_off
LOG_SEQ_FILE=/workspace/.log_seq

flush_log_stream() {
  # POST whatever was appended to build.log since the last recorded offset, then
  # advance the offset. Shared by the poller (every 2s) and report() (final
  # flush). No-op when EVENTS_URL is unset or nothing new was written.
  [ -z "$EVENTS_URL" ] && return
  [ -f /workspace/build.log ] || return
  local off size delta
  off=$(cat "$LOG_OFF_FILE" 2>/dev/null || echo 0)
  size=$(wc -c < /workspace/build.log 2>/dev/null || echo 0)
  [ "$size" -le "$off" ] && return
  # tail -c +N is 1-indexed (byte N onward), so +off+1 starts just past what we
  # already sent. Reads the delta in one go (not byte-by-byte).
  delta=$(tail -c +$((off + 1)) /workspace/build.log 2>/dev/null)
  echo "$size" > "$LOG_OFF_FILE"
  emit_log_chunk "$delta"
}

start_log_stream() {
  # Poll build.log every 2s and flush the delta — one delta = one batched POST,
  # so a chatty build is ~1 row every 2s, not one per line. Runs for the WHOLE
  # run (clone…secret), tagging each chunk with the live STEP_NAME.
  # ponytail: 2s poll, fine for a human-watched console.
  [ -z "$EVENTS_URL" ] && return
  echo 0 > "$LOG_OFF_FILE"
  echo 0 > "$LOG_SEQ_FILE"
  ( while :; do sleep 2; flush_log_stream; done ) &
  LOG_STREAM_PID=$!
}

stop_log_stream() {
  [ -z "$LOG_STREAM_PID" ] && return
  kill "$LOG_STREAM_PID" 2>/dev/null || true
  wait "$LOG_STREAM_PID" 2>/dev/null || true
  LOG_STREAM_PID=""
}

# Best-effort container free RAM in MB from /proc/meminfo (portable Linux source;
# the Sandbox container is Linux per Dockerfile). Prints nothing if MemAvailable
# is absent — caller leaves STEP_RAM_MB empty and no ram field is emitted.
read_ram_mb() {
  local kb
  kb=$(grep -m1 '^MemAvailable:' /proc/meminfo 2>/dev/null | awk '{print $2}')
  if [ -n "$kb" ]; then echo $(( kb / 1024 )); fi
}

# During-build RAM heartbeat. The build is the OOM-prone step and can go SILENT
# for minutes (no Next.js output) right when it's thrashing — so a sampler writes
# a "[mem] N MB free" line into build.log every 10s. It rides the existing log
# stream (the poller tails build.log), so it needs no new POST path or schema:
# a silent build whose [mem] keeps dropping = OOM thrash; silent with stable mem
# = a real deadlock. Lets the next hang explain itself.
MEM_SAMPLER_PID=""
start_mem_sampler() {
  ( while :; do
      mb=$(read_ram_mb)
      [ -n "$mb" ] && echo "[mem] \${mb} MB free" >> /workspace/build.log
      sleep 10
    done ) &
  MEM_SAMPLER_PID=$!
}
stop_mem_sampler() {
  [ -z "$MEM_SAMPLER_PID" ] && return
  kill "$MEM_SAMPLER_PID" 2>/dev/null || true
  wait "$MEM_SAMPLER_PID" 2>/dev/null || true
  MEM_SAMPLER_PID=""
}

step_start() {
  # $1=step name. Records start time + emits a started event.
  STEP_NAME="$1"
  STEP_START_MS=$(now_ms)
  STEP_RAM_MB=""
  # Publish the live step name to a file so the log-stream poller (a subshell
  # that forked before this step) tags its chunks with the CURRENT step.
  echo "$STEP_NAME" > /workspace/.log_step 2>/dev/null || true
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

# Stream the WHOLE run live (deploy-log-stream), not just the build: clone, npm,
# cf-typegen, build, provision, migrate, deploy and secret all write to the same
# build.log, and each chunk is tagged with the in-flight STEP_NAME. So a failure
# (or hang) in ANY step shows its real output in the console. Started once here,
# stopped right before the terminal callback below.
start_log_stream

rm -rf /workspace/src

step_start clone
# Auth the private clone via a git config Authorization header sourced from env,
# so the token never appears in argv/ps or the stored remote URL. GIT_CONFIG_*
# lets git read config keys from the environment (value is pre-expanded here).
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="http.extraHeader"
export GIT_CONFIG_VALUE_0="Authorization: Basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\\n')"
# -c advice.detachedHead=false: cloning a tag checks out a detached HEAD, and
# git's advice block would otherwise dump 10 lines into the streamed log.
git -c advice.detachedHead=false clone --depth 1 --branch "$REF" "$REPO_URL" /workspace/src
clone_rc=$?
unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
if [ $clone_rc -ne 0 ]; then step_fail "git clone failed"; report failed "git clone failed"; exit 1; fi
step_ok

cd /workspace/src/CMS || { report failed "CMS dir missing"; exit 1; }

step_start npm
npm ci || npm install
if [ $? -ne 0 ]; then step_fail "npm install failed"; report failed "npm install failed"; exit 1; fi
step_ok

# Regenerate cloudflare-env.d.ts (the typed \`CloudflareEnv\` + Workers runtime
# globals like R2ObjectBody). It is .gitignored, so a fresh clone lacks it and
# \`opennextjs-cloudflare build\` (which runs tsc) fails with "Cannot find name
# 'R2ObjectBody'" / "Property 'DB' does not exist on type 'CloudflareEnv'".
# \`wrangler types\` derives it deterministically from CMS/wrangler.jsonc.
npm run cf-typegen
if [ $? -ne 0 ]; then step_fail "cf-typegen failed"; report failed "cf-typegen failed"; exit 1; fi

step_start build
# Sample free RAM (best-effort) for the OOM-prone build step; reported on the
# build event as ramAvailableMb (instance was bumped standard-1->standard-2 here).
STEP_RAM_MB=$(read_ram_mb)
# Heartbeat RAM into build.log every 10s so a SILENT hang (next build emits
# nothing for minutes when thrashing) still shows whether memory is dropping.
start_mem_sampler
npx opennextjs-cloudflare build
build_rc=$?
stop_mem_sampler
# Re-sample after the build so the reported value reflects post-build headroom.
STEP_RAM_MB=$(read_ram_mb)
if [ $build_rc -ne 0 ]; then step_fail "opennext build failed"; report failed "opennext build failed"; exit 1; fi
step_ok

# --- Per-Site infra provisioning (idempotent) -------------------------------
# Each Site gets its OWN D1 + R2 bucket (the DB/bucket IS the Site boundary).
# CMS/wrangler.jsonc ships placeholder bindings (zero-id D1, generic bucket);
# wrangler REJECTS the upload against those, so we create the real resources and
# patch the (ephemeral, cloned) wrangler.jsonc with their identifiers before
# deploy. $SLUG is regex-validated in the Worker (^[a-z0-9](-[a-z0-9])*$), so it
# is shell-safe to interpolate into resource names.
# ponytail: the bizbeecms-cms[-media] name patterns are inlined here (not pulled
# from the TS constants) because this heredoc runs in the container as bash and
# can't import the module. Documented in DEPLOY-ARCHITECTURE.md; keep in sync.
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
  --var "CMS_AUTH_SECRET:$CMS_AUTH_SECRET" \
  --var "APP_ORIGIN:$APP_ORIGIN"
if [ $? -ne 0 ]; then step_fail "wrangler deploy failed"; report failed "wrangler deploy failed"; exit 1; fi
step_ok

# OPENROUTER_API_KEY is a WORKER SECRET, not a --var (it never belongs in
# wrangler.jsonc or a logged command). Set it AFTER deploy succeeds; persists
# across redeploys and this overwrites each deploy (correct). Piped via stdin so
# the value never appears in argv/process listing; SET_OPENROUTER_SECRET is ""
# when the effective key is empty → skip so we don't set a blank secret. Never
# echo $OPENROUTER_API_KEY anywhere.
if [ -n "$SET_OPENROUTER_SECRET" ]; then
  step_start secret
  printf '%s' "$OPENROUTER_API_KEY" | npx wrangler secret put OPENROUTER_API_KEY --name "$WORKER_NAME"
  if [ $? -ne 0 ]; then step_fail "openrouter secret put failed"; report failed "openrouter secret put failed"; exit 1; fi
  step_ok
fi

report deployed
echo "DONE"
`;
}
