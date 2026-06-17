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
 * container (the Sandbox DO). The PM calls `POST /deploy` with a Site slug; this
 * Worker clones the repo, runs the REAL `opennextjs-cloudflare build` +
 * `wrangler deploy` for that Site's CMS Worker inside the container (the same
 * path that deploys the PM, so bundling + assets + bindings all work), then
 * POSTs the result back to the PM. The build runs in the background
 * (`ctx.waitUntil`) so the HTTP call returns immediately (async fire-and-poll).
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/deploy" && request.method === "POST") {
      // Auth: shared bearer secret from the PM.
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
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !siteId) {
        return Response.json({ error: "badRequest" }, { status: 400 });
      }

      // Kick the build off in the background; respond immediately.
      ctx.waitUntil(runDeploy(env, { siteId, slug, ref: body.ref }));
      return Response.json({ accepted: true, slug });
    }

    return new Response("Not found", { status: 404 });
  },
};

/**
 * Clone → build → deploy the CMS for one Site inside a fresh container, then
 * report the outcome back to the PM. Never throws (it's a background task); all
 * failures are caught and reported as a failed status callback.
 */
async function runDeploy(
  env: Env,
  input: { siteId: string; slug: string; ref?: string },
): Promise<void> {
  const workerName = `${WORKER_PREFIX}${input.slug}`.slice(0, 63);
  // One sandbox per Site deploy; id is stable so concurrent re-clicks coalesce.
  const sandbox = getSandbox(env.Sandbox, `deploy-${input.slug}`);

  // Secrets that must never appear in logs or the status callback.
  const secrets = [env.GITHUB_TOKEN, env.CF_API_TOKEN].filter(
    (s): s is string => !!s,
  );
  const redact = (s: string): string => {
    let out = s;
    for (const secret of secrets) out = out.split(secret).join("***");
    return out;
  };

  const log: string[] = [];
  const run = async (cmd: string, opts?: { env?: Record<string, string> }) => {
    const res = await sandbox.exec(cmd, opts);
    // Redact defensively even though we avoid putting secrets in cmd/output.
    log.push(redact(`$ ${cmd}\n${res.stdout}\n${res.stderr}`));
    if (!res.success) {
      throw new Error(redact(`command failed (${res.exitCode}): ${cmd}`));
    }
    return res;
  };

  try {
    const ref = input.ref && /^[\w.\-/]+$/.test(input.ref) ? input.ref : "main";

    // Auth the clone WITHOUT putting the token in the URL or command string:
    // pass it as an Authorization header via git's config, sourced from an env
    // var so it never lands in argv, the command log, or the repo's remote URL.
    const cloneEnv: Record<string, string> = {};
    let authFlag = "";
    if (env.GITHUB_TOKEN) {
      const basic = btoa(`x-access-token:${env.GITHUB_TOKEN}`);
      cloneEnv.GIT_AUTH_HEADER = `Authorization: Basic ${basic}`;
      authFlag = `-c http.extraHeader="$GIT_AUTH_HEADER"`;
    }

    // Fresh checkout each deploy (shallow for speed).
    await run(`rm -rf /workspace/src`);
    await run(
      `git ${authFlag} clone --depth 1 --branch ${ref} ${env.REPO_URL} /workspace/src`,
      { env: cloneEnv },
    );

    // Install + build + deploy the CMS as this Site's own Worker. The OpenNext
    // build + wrangler deploy is the SAME path that deploys the PM, so the
    // bundle boots and static assets + bindings are handled by wrangler.
    const cmsDir = "/workspace/src/CMS";
    await run(`npm ci --prefix ${cmsDir} || npm install --prefix ${cmsDir}`);
    await run(`cd ${cmsDir} && npx opennextjs-cloudflare build`, {
      env: { NODE_ENV: "production" },
    });
    await run(
      `cd ${cmsDir} && npx wrangler deploy --name ${workerName} ` +
        `--compatibility-date 2025-09-01`,
      {
        env: {
          CLOUDFLARE_API_TOKEN: env.CF_API_TOKEN,
          CLOUDFLARE_ACCOUNT_ID: env.CF_ACCOUNT_ID,
        },
      },
    );

    await report(env, {
      siteId: input.siteId,
      status: "deployed",
      workerName,
    });
  } catch (err) {
    // Redact secrets from anything sent back to the PM. The full (already
    // redacted) command log stays in the deployer's own observability logs.
    const rawMsg = err instanceof Error ? err.message : String(err);
    console.error("deploy failed", redact(rawMsg), redact(log.join("\n---\n")));
    await report(env, {
      siteId: input.siteId,
      status: "failed",
      error: redact(rawMsg).slice(0, 500),
    });
  } finally {
    try {
      await sandbox.destroy();
    } catch {
      // best-effort cleanup
    }
  }
}

/** POST the deploy outcome back to the PM's callback endpoint. */
async function report(
  env: Env,
  payload: {
    siteId: string;
    status: "deployed" | "failed";
    workerName?: string;
    error?: string;
  },
): Promise<void> {
  if (!env.PM_CALLBACK_ORIGIN) return;
  try {
    await fetch(`${env.PM_CALLBACK_ORIGIN}/api/deploy-callback`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.DEPLOYER_SECRET}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // If the callback fails the Site stays `deploying`; a re-deploy recovers it.
  }
}
