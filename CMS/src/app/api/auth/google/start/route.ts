import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildGoogleAuthUrl, signState } from "@/lib/auth/google-core";
import { decideGoogleRoute } from "@/lib/auth/google-config";
import { getGoogleClientConfig } from "@/db/google-client-store";

/**
 * Google sign-in START (cms-auth REWORK). Redirects the browser to Google's
 * consent screen with a signed `state` (stateless CSRF defence — verified in the
 * callback). The Google client id comes from the PER-SITE config stored in the
 * CMS's own D1 (the customer registers their OWN OAuth client) — NOT a shared
 * deployer-injected env var. The redirect_uri is built from `APP_ORIGIN` (the
 * deployer-injected stable workers.dev origin) so it EXACTLY matches the URI
 * registered in the customer's Google client AND the one the callback rebuilds
 * for the token exchange — Google rejects any mismatch. NEVER derive it from
 * request Host headers (would break the registered-URI match + invite a
 * redirect-URI-poisoning surface).
 *
 * If this Site's Google client isn't configured (no id / secret / APP_ORIGIN),
 * fall back to /admin (the login page) rather than erroring — the button is only
 * shown when configured, so this is just defence-in-depth.
 *
 * REST route handler, not a server action (server actions 500 on OpenNext).
 */
function back(): Response {
  return new Response(null, { status: 302, headers: { location: "/admin" } });
}

export async function GET(): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  const cmsSecret = typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
  const appOrigin = typeof e.APP_ORIGIN === "string" ? e.APP_ORIGIN : "";

  const config = await getGoogleClientConfig();
  const decision = decideGoogleRoute(config, appOrigin);
  if (!decision.usable || !cmsSecret) return back();

  const state = await signState(cmsSecret);
  const url = buildGoogleAuthUrl({
    clientId: decision.clientId,
    redirectUri: decision.redirectUri,
    state,
  });
  return new Response(null, { status: 302, headers: { location: url } });
}
