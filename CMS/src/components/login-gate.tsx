import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { shouldShowSsoButton } from "@/lib/auth/guard-core";
import { decideGoogleRoute } from "@/lib/auth/google-config";
import { getGoogleClientConfig } from "@/db/google-client-store";
import { verifyForwardedHost } from "@/lib/auth/forwarded-host";
import { LoginForm } from "@/components/login-form";
import { AfterLoginCookie } from "@/components/after-login-cookie";

/**
 * The in-CMS login page (email/password + optional PM SSO + optional Google),
 * rendered wherever a signed-out visitor lands on a gated surface: the /admin
 * layout, and the OAuth consent page (`/oauth/authorize`). Server component —
 * resolves the SSO/Google availability + URLs from env/D1 exactly as the admin
 * layout always did (extracted verbatim; see the notes inline).
 *
 * `returnTo`: where to land after a successful login (default /admin). The
 * consent page passes its own URL so the waiting MCP client gets its answer;
 * password login navigates there directly, and SSO/Google (which round-trip
 * through PM/Google and come back to a fixed callback) read it from the
 * short-lived `bb_after_login` cookie the page stamps.
 */
export async function LoginGate({ returnTo }: { returnTo?: string } = {}): Promise<ReactNode> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as {
    PM_ORIGIN?: string;
    CMS_AUTH_SECRET?: string;
    APP_ORIGIN?: string;
  };
  const pmOrigin = e.PM_ORIGIN;
  // Google button shows only when THIS Site has its OWN Google client configured
  // in CMS D1 (REWORK #3 — no shared env client). `decideGoogleRoute().usable`
  // is the single signal: configured client (id + secret) AND an APP_ORIGIN to
  // build the redirect_uri. The button just links to /api/auth/google/start —
  // no secret reaches the client.
  const showGoogle = decideGoogleRoute(
    await getGoogleClientConfig(),
    e.APP_ORIGIN ?? "",
  ).usable;

  const h = await headers();

  // Surface a Google callback error (?error=…) as a banner on the login page.
  const reqForError = h.get("x-forwarded-url") ?? h.get("referer");
  let loginError: string | null = null;
  try {
    if (reqForError) loginError = new URL(reqForError).searchParams.get("error");
  } catch {
    loginError = null;
  }

  // Show the SSO button whenever this CMS can honor the SSO handoff (PM_ORIGIN
  // set). Not gated on a PM referer/?from=pm — that was unreliable (a Next layout
  // doesn't get the query string, and an apex→www 301 strips the Referer).
  const showSso = shouldShowSsoButton(pmOrigin);

  // Build the SSO handoff URL behind the button (unchanged handoff, just gated).
  // The public host the BROWSER is on, for the SSO return URL. The router proxies
  // customer domains to this Worker's internal workers.dev origin, so the request
  // host is normalized to workers.dev by OpenNext — the router preserves the real
  // host in a SIGNED x-bizbee-host header (HMAC-verified, else a direct workers.dev
  // hit could forge it to spoof the SSO return → open redirect). This is the ONLY
  // place the CMS builds a host-dependent URL — keep it so.
  let ssoUrl = "";
  if (pmOrigin) {
    const verifiedHost = await verifyForwardedHost(
      h.get("x-bizbee-host"),
      h.get("x-bizbee-host-sig"),
      e.CMS_AUTH_SECRET,
    );
    const host = verifiedHost ?? h.get("host");
    // Always https: OpenNext on Workers reports x-forwarded-proto as "http"
    // (the in-Worker hop isn't TLS), and PM's open-redirect guard rejects any
    // non-https return — so an http return URL can never complete the handoff.
    const returnUrl = `https://${host}/api/auth/sso-callback`;
    ssoUrl =
      `${pmOrigin.replace(/\/+$/, "")}/api/auth/cms-sso` +
      `?return=${encodeURIComponent(returnUrl)}`;
  }

  return (
    <>
      {returnTo && <AfterLoginCookie path={returnTo} />}
      <LoginForm
        showSso={showSso && ssoUrl !== ""}
        ssoUrl={ssoUrl}
        showGoogle={showGoogle}
        error={loginError}
        returnTo={returnTo}
      />
    </>
  );
}
