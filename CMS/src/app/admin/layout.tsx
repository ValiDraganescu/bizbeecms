import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { checkAdminFromHeaders } from "@/lib/auth/guard";
import { AdminNav } from "@/components/admin-nav";

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
    return (
      <>
        <AdminNav />
        {children}
      </>
    );
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

  // Not signed in (or misconfigured / PM unreachable) → send to PM login.
  const { env } = await getCloudflareContext({ async: true });
  const pmOrigin = (env as unknown as { PM_ORIGIN?: string }).PM_ORIGIN;
  redirect(pmOrigin ? `${pmOrigin.replace(/\/+$/, "")}/login` : "/");
}
