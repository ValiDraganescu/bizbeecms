import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { checkAdminFromHeaders } from "@/lib/auth/guard";
import { verifyForwardedHost } from "@/lib/auth/forwarded-host";
import { SidebarShell } from "@/components/admin-sidebar";

export const dynamic = "force-dynamic";

/**
 * Admin surface auth gate (Sec1). Wraps EVERY /admin/* page. Defense-in-depth
 * alongside the per-route /api/* guard: a page render is server-checked against
 * PM (`checkAdminFromHeaders`) before any admin chrome is shown.
 *
 * - signed in WITH site access  → render the page.
 * - signed out / config/error   → redirect to PM login (where the user signs in,
 *   getting the `bizbee_session` cookie the guard needs).
 * - signed in WITHOUT access     → a forbidden notice (no redirect loop — they
 *   ARE signed in, they just can't manage this Site).
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

  // Not signed in. PM's session cookie lives on a DIFFERENT host (and *.workers.dev
  // is on the Public Suffix List, so it can't be shared), so we can't just read it
  // here. Kick off the SSO handoff: send the user to PM's cms-sso, which (once it
  // confirms they're signed into PM) bounces back to our sso-callback with a
  // one-time nonce we exchange for a session cookie on THIS host.
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as { PM_ORIGIN?: string; CMS_AUTH_SECRET?: string };
  const pmOrigin = e.PM_ORIGIN;
  if (!pmOrigin) redirect("/");

  // The public host the BROWSER is on, for the SSO return URL. The router proxies
  // customer domains to this Worker's internal workers.dev origin, so the request
  // host / x-forwarded-host are normalized to workers.dev by OpenNext — the router
  // preserves the real host in a SIGNED x-bizbee-host header. We only trust it
  // when the HMAC verifies (else a direct workers.dev hit could forge it to spoof
  // the SSO return → open redirect). Fall back to the request host when there's no
  // valid signature (a legit direct workers.dev hit). PM ALSO re-validates the
  // return host against HOST_MAP, so this is defense-in-depth, not the only gate.
  // This is the ONLY place the CMS builds a host-dependent URL — keep it so.
  const h = await headers();
  const verifiedHost = await verifyForwardedHost(
    h.get("x-bizbee-host"),
    h.get("x-bizbee-host-sig"),
    e.CMS_AUTH_SECRET,
  );
  const host = verifiedHost ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const returnUrl = `${proto}://${host}/api/auth/sso-callback`;
  const ssoUrl =
    `${pmOrigin.replace(/\/+$/, "")}/api/auth/cms-sso` +
    `?return=${encodeURIComponent(returnUrl)}`;
  redirect(ssoUrl);
}
