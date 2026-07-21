import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { checkAdminFromHeaders } from "@/lib/auth/guard";
import { shouldShowSsoButton } from "@/lib/auth/guard-core";
import { decideGoogleRoute } from "@/lib/auth/google-config";
import { getGoogleClientConfig } from "@/db/google-client-store";
import { verifyForwardedHost } from "@/lib/auth/forwarded-host";
import { SidebarShell } from "@/components/admin-sidebar";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

/**
 * Admin surface auth gate (Sec1 → cms-auth Slice 2). Wraps EVERY /admin/* page.
 * Defense-in-depth alongside the per-route /api/* guard: a page render is
 * server-checked (local session → user) before any admin chrome is shown.
 *
 * - signed in              → render the page.
 * - signed out             → render the in-CMS LOGIN PAGE (email/password +,
 *   when the visitor arrived from PM, the "Sign in with BizbeeCMS" SSO button).
 *   NO MORE auto-redirect to PM — a client's own team logs in here directly.
 * - signed in WITHOUT access → forbidden notice (kept for parity; local users
 *   that exist are allowed, so this is the SSO-denied path).
 *
 * Page-level gating is NOT a substitute for the /api/* guard (data routes are
 * hit directly), so both layers exist by design.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const decision = await checkAdminFromHeaders();
  if (decision.allow) {
    return <SidebarShell>{children}</SidebarShell>;
  }

  if (decision.reason === "denied") {
    const t = await getTranslations("adminAuth");
    return (
      <main className="mx-auto flex max-w-md flex-col gap-3 p-10 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{t("forbiddenTitle")}</h1>
        <p className="text-foreground-muted">{t("forbiddenBody")}</p>
      </main>
    );
  }

  // Not signed in → show the in-CMS login page (no auto-redirect to PM).
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
    <LoginForm
      showSso={showSso && ssoUrl !== ""}
      ssoUrl={ssoUrl}
      showGoogle={showGoogle}
      error={loginError}
    />
  );
}
