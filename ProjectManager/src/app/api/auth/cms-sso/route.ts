import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSessionId } from "@/lib/auth/session";
import {
  SSO_NONCE_PREFIX,
  SSO_NONCE_TTL_SECONDS,
  appendNonce,
  classifyCmsReturnUrl,
  newSsoNonce,
} from "@/lib/auth/cms-sso";

/**
 * CMS SSO initiation (cross-host auth bridge). A per-Site CMS admin with no local
 * session sends the browser here with `?return=<cms-callback-url>`.
 *
 * - Logged in  → mint a one-time nonce, store `sso:<nonce> -> sid` in KV (60s),
 *   and 302 the browser back to the CMS callback with `?sso=<nonce>`. The CMS
 *   then exchanges the nonce for the sid server-to-server (cms-sso-exchange) and
 *   sets its own cookie. The session id never appears in the URL.
 * - Not logged in → 302 to `/login?next=<this full sso url>` so that after sign-in
 *   the user lands right back here and the handoff completes.
 *
 * The `return` URL is validated (open-redirect guard) before use.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const { env } = await getCloudflareContext({ async: true });

  // Open-redirect guard. Statically-known CMS hosts pass immediately; an unknown
  // host is only accepted if it's a Site's registered custom domain (HOST_MAP).
  const classified = classifyCmsReturnUrl(url.searchParams.get("return"));
  if (!classified) {
    return NextResponse.json({ error: "badReturn" }, { status: 400 });
  }
  let returnUrl: string;
  if ("url" in classified) {
    returnUrl = classified.url;
  } else {
    const mapped = await env.HOST_MAP.get(classified.host);
    if (!mapped) {
      return NextResponse.json({ error: "badReturn" }, { status: 400 });
    }
    returnUrl = `https://${classified.host}/api/auth/sso-callback`;
  }

  const sid = await getSessionId();
  if (!sid) {
    // Bounce through login, then come straight back to this same SSO URL.
    const next = `${url.pathname}${url.search}`;
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(next)}`, url.origin),
    );
  }

  const nonce = newSsoNonce();
  await env.SESSIONS.put(
    SSO_NONCE_PREFIX + nonce,
    JSON.stringify({ sid }),
    { expirationTtl: SSO_NONCE_TTL_SECONDS },
  );

  return NextResponse.redirect(appendNonce(returnUrl, nonce));
}
