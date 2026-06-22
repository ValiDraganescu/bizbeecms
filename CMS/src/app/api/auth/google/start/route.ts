import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildGoogleAuthUrl, signState } from "@/lib/auth/google-core";

/**
 * Google sign-in START (cms-auth Slice 2b). Redirects the browser to Google's
 * consent screen with a signed `state` (stateless CSRF defence — verified in the
 * callback). The redirect_uri is built from `APP_ORIGIN` (the deployer-injected
 * stable workers.dev origin) so it EXACTLY matches the URI registered in the
 * Google OAuth client AND the one the callback rebuilds for the token exchange —
 * Google rejects any mismatch. NEVER derive it from request Host headers (would
 * break the registered-URI match + invite a redirect-URI-poisoning surface).
 *
 * If Google isn't configured (no client id / secret / APP_ORIGIN), fall back to
 * /admin (the login page) rather than erroring — the button is only shown when
 * configured, so this is just defence-in-depth.
 *
 * REST route handler, not a server action (server actions 500 on OpenNext).
 */
function back(): Response {
  return new Response(null, { status: 302, headers: { location: "/admin" } });
}

export async function GET(): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  const clientId = typeof e.GOOGLE_CLIENT_ID === "string" ? e.GOOGLE_CLIENT_ID : "";
  const secret = typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
  const appOrigin = typeof e.APP_ORIGIN === "string" ? e.APP_ORIGIN : "";
  if (!clientId || !secret || !appOrigin) return back();

  const state = await signState(secret);
  const redirectUri = `${appOrigin.replace(/\/+$/, "")}/api/auth/google/callback`;
  const url = buildGoogleAuthUrl({ clientId, redirectUri, state });
  return new Response(null, { status: 302, headers: { location: url } });
}
