import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cmsValidateUrl, SESSION_COOKIE } from "@/lib/auth/guard-core";
import { createSession } from "@/db/session-store";
import { createUser, findUserByEmail } from "@/db/user-store";

/**
 * CMS SSO callback (cross-host auth bridge) — cms-auth Slice 2 rewrite.
 *
 * PM redirects the browser here with a one-time `?sso=<nonce>` after confirming
 * the user is signed into PM. We:
 *   1. exchange the nonce → PM's session id (server-to-server, bearer secret),
 *   2. run PM's cms-validate ONCE (the SSO HANDSHAKE) with that sid + our siteId
 *      to confirm the operator reaches this Site and learn their PM userId,
 *   3. UPSERT a CMS-LOCAL user for them (role=Admin per the "PM-with-site-access
 *      = Admin" rule; passwordHash=NULL — SSO-only, no local credential),
 *   4. mint a CMS-LOCAL session and set `bizbee_session` to ITS id.
 *
 * From then on the guard resolves the cookie LOCALLY (D1 session → user) — it no
 * longer forwards every request to PM. cms-validate is only this handshake now.
 *
 * EMAIL NOTE: cms-validate returns the PM userId but NOT the email, and we can't
 * touch PM this slice. So the SSO operator's CMS row is keyed by a stable
 * synthetic email derived from the PM userId (`<userId>@pm.sso`). It's unique +
 * idempotent (same operator → same row) and they never log in by email anyway
 * (passwordHash is NULL). Backfill to the real email once PM returns it. See
 * CAVEATS.
 *
 * Fail-closed: a missing/expired/used nonce, a denied cms-validate, missing
 * config, or any error → back to /admin with no cookie (which re-initiates SSO;
 * no infinite loop because a fresh PM session mints a fresh nonce).
 */

// Redirect to /admin using a RELATIVE Location (no host). The browser resolves it
// against the host it actually requested. (Set-Cookie is handled by createSession
// via next/headers, so this redirect carries it automatically.)
function redirectToAdmin(): Response {
  return new Response(null, { status: 302, headers: { location: "/admin" } });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const nonce = url.searchParams.get("sso") ?? "";

  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  const pmOrigin = typeof e.PM_ORIGIN === "string" ? e.PM_ORIGIN : "";
  const secret = typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
  const siteId = typeof e.SITE_ID === "string" ? e.SITE_ID : "";

  if (!nonce || !pmOrigin || !secret || !siteId) {
    return redirectToAdmin();
  }

  // 1. nonce → PM sid.
  let sid = "";
  try {
    const res = await fetch(`${pmOrigin.replace(/\/+$/, "")}/api/auth/cms-sso-exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ nonce }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: unknown; sid?: unknown } | null;
    if (res.status === 200 && body && body.ok === true && typeof body.sid === "string") {
      sid = body.sid;
    }
  } catch {
    sid = "";
  }
  if (!sid) return redirectToAdmin();

  // 2. cms-validate handshake → confirm Site reach + get the PM userId.
  let pmUserId = "";
  try {
    const res = await fetch(cmsValidateUrl(pmOrigin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
        cookie: `${SESSION_COOKIE}=${sid}`,
      },
      body: JSON.stringify({ siteId }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: unknown; userId?: unknown }
      | null;
    if (res.status === 200 && body && body.ok === true && typeof body.userId === "string") {
      pmUserId = body.userId;
    }
  } catch {
    pmUserId = "";
  }
  if (!pmUserId) return redirectToAdmin();

  // 3. UPSERT the CMS-local user (Admin, SSO-only). Synthetic email keyed on the
  //    PM userId so the upsert is idempotent. See header note + CAVEATS.
  const ssoEmail = `${pmUserId}@pm.sso`;
  try {
    let user = await findUserByEmail(ssoEmail);
    if (!user) {
      user = await createUser({ email: ssoEmail, passwordHash: null, role: "Admin" });
    }
    // 4. Mint a CMS-local session (sets the bizbee_session cookie).
    await createSession(user.id);
  } catch {
    return redirectToAdmin();
  }

  return redirectToAdmin();
}
