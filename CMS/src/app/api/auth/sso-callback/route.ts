import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SESSION_COOKIE } from "@/lib/auth/guard-core";

/**
 * CMS SSO callback (cross-host auth bridge). PM redirects the browser here with a
 * one-time `?sso=<nonce>` after confirming the user is signed in. We exchange the
 * nonce for the underlying session id server-to-server against PM (bearer
 * CMS_AUTH_SECRET), then set OUR OWN `bizbee_session` cookie on this CMS host and
 * send the user to /admin. From then on the existing guard forwards that cookie
 * to PM's cms-validate exactly like a same-origin request.
 *
 * Fail-closed: a missing/expired/used nonce, missing config, or any error → back
 * to /admin with no cookie (which re-initiates SSO; no infinite loop because a
 * fresh PM session mints a fresh nonce).
 */
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // mirror PM's 7-day session TTL

// Redirect to /admin using a RELATIVE Location (no host). The browser resolves it
// against the host it actually requested — restovista.com when the router proxied a
// custom domain, or the workers.dev host otherwise. This both fixes the
// custom-domain bounce (request.url here is the internal workers.dev origin, so an
// absolute redirect would kick the user off their own domain) AND closes the
// open-redirect hole: we never trust the spoofable `x-forwarded-host` to build a
// redirect target, so a forged header can't bounce anyone to an attacker host.
function redirectToAdmin(setCookieSid?: string): Response {
  const res = new Response(null, { status: 302, headers: { location: "/admin" } });
  if (setCookieSid) {
    res.headers.append(
      "set-cookie",
      `${SESSION_COOKIE}=${setCookieSid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`,
    );
  }
  return res;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const nonce = url.searchParams.get("sso") ?? "";

  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  const pmOrigin = typeof e.PM_ORIGIN === "string" ? e.PM_ORIGIN : "";
  const secret = typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";

  if (!nonce || !pmOrigin || !secret) {
    return redirectToAdmin();
  }

  let sid = "";
  try {
    const res = await fetch(
      `${pmOrigin.replace(/\/+$/, "")}/api/auth/cms-sso-exchange`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ nonce }),
      },
    );
    const body = (await res.json().catch(() => null)) as
      | { ok?: unknown; sid?: unknown }
      | null;
    if (res.status === 200 && body && body.ok === true && typeof body.sid === "string") {
      sid = body.sid;
    }
  } catch {
    sid = "";
  }

  if (!sid) {
    return redirectToAdmin();
  }

  return redirectToAdmin(sid);
}
