import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cmsValidateUrl, SESSION_COOKIE } from "@/lib/auth/guard-core";
import { createSession } from "@/db/session-store";
import { upsertSsoUser } from "@/db/user-store";

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
 * EMAIL: cms-validate now returns the operator's real verified PM email alongside
 * the userId. `upsertSsoUser` keys the CMS row on that real email AND backfills any
 * earlier synthetic `<userId>@pm.sso` row (Slice-2 stopgap) to it — so operators
 * show under their real address in the user list. If an older PM deploy omits the
 * email, the upsert falls back to the synthetic email (unchanged behaviour).
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

  // 2. cms-validate handshake → confirm Site reach + get the PM userId + email.
  let pmUserId = "";
  let pmEmail: string | null = null;
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
      | { ok?: unknown; userId?: unknown; email?: unknown }
      | null;
    if (res.status === 200 && body && body.ok === true && typeof body.userId === "string") {
      pmUserId = body.userId;
      pmEmail = typeof body.email === "string" ? body.email : null;
    }
  } catch {
    pmUserId = "";
  }
  if (!pmUserId) return redirectToAdmin();

  // 3. UPSERT the CMS-local user (Admin, SSO-only). Keyed on the real PM email when
  //    available (backfilling any earlier synthetic row); falls back to the
  //    synthetic email otherwise. See header note + CAVEATS.
  try {
    const user = await upsertSsoUser(pmUserId, pmEmail);
    // 4. Mint a CMS-local session (sets the bizbee_session cookie).
    await createSession(user.id);
  } catch {
    return redirectToAdmin();
  }

  return redirectToAdmin();
}
