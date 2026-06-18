/**
 * CMS admin auth guard (Sec1) — the impure wiring around `guard-core.ts`.
 *
 * The whole CMS admin surface (/admin/* pages + /api/* admin routes) is gated by
 * `requireAdmin`. The CMS Worker can't read PM's KV session or D1, so it forwards
 * the incoming `bizbee_session` cookie to PM's `/api/auth/cms-validate` with the
 * shared `CMS_AUTH_SECRET` bearer + `{ siteId: env.SITE_ID }`. PM resolves the
 * session → user and runs the Site-reach authz; only `{ok:true}` allows.
 *
 * Fail-closed: missing config, no cookie, a non-200 / non-ok answer, or any
 * network/parse error all DENY. A misconfigured CMS locks itself rather than
 * exposing the admin surface.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  cmsValidateUrl,
  decideFromValidate,
  isGuardConfigured,
  readSessionCookie,
  type GuardConfig,
  type GuardDecision,
} from "./guard-core";

function readConfig(env: Record<string, unknown>): GuardConfig {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    pmOrigin: str(env.PM_ORIGIN),
    authSecret: str(env.CMS_AUTH_SECRET),
    siteId: str(env.SITE_ID),
  };
}

/**
 * Authorize against PM given the session cookie value already extracted. Shared
 * by the Request-based (API) and headers-based (page/layout) entry points.
 */
async function decide(session: string): Promise<GuardDecision> {
  const { env } = await getCloudflareContext({ async: true });
  const cfg = readConfig(env as unknown as Record<string, unknown>);

  if (!isGuardConfigured(cfg)) {
    return { allow: false, reason: "unconfigured" };
  }
  if (!session) {
    return { allow: false, reason: "noSession" };
  }

  try {
    const res = await fetch(cmsValidateUrl(cfg.pmOrigin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.authSecret}`,
        // Forward ONLY the session cookie (not the whole request cookie jar).
        cookie: `${SESSION_COOKIE}=${session}`,
      },
      body: JSON.stringify({ siteId: cfg.siteId }),
    });
    let body: { ok?: unknown; userId?: unknown } | null = null;
    try {
      body = (await res.json()) as { ok?: unknown; userId?: unknown };
    } catch {
      body = null;
    }
    return decideFromValidate(res.status, body);
  } catch {
    return { allow: false, reason: "error" };
  }
}

/** Authorize an incoming /api/* `Request` (reads the Cookie header). */
export async function checkAdmin(request: Request): Promise<GuardDecision> {
  return decide(readSessionCookie(request.headers.get("cookie")));
}

/** Authorize a page/layout render (reads the cookie via `next/headers`). */
export async function checkAdminFromHeaders(): Promise<GuardDecision> {
  const jar = await cookies();
  return decide(jar.get(SESSION_COOKIE)?.value ?? "");
}

/**
 * Guard an admin /api/* route. Returns a 401 `Response` to short-circuit when
 * the request is not an authorized admin, or `null` to proceed.
 *
 *   const denied = await requireAdmin(request);
 *   if (denied) return denied;
 */
export async function requireAdmin(request: Request): Promise<Response | null> {
  const decision = await checkAdmin(request);
  if (decision.allow) return null;
  return Response.json(
    { error: "unauthorized", reason: decision.reason },
    { status: 401 },
  );
}
