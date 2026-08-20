import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { checkAdminFromHeaders } from "@/lib/auth/guard";
import { findUserById } from "@/db/user-store";
import { SidebarShell } from "@/components/admin-sidebar";
import { LoginGate } from "@/components/login-gate";

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
    // Account row data for the sidebar footer. The dev backdoor has no user
    // row; fall back to a synthetic identity so the shell still renders.
    const user = decision.userId ? await findUserById(decision.userId) : null;
    const account = {
      email: user?.email ?? "dev@localhost",
      role: user?.role ?? decision.role ?? null,
    };
    return <SidebarShell account={account}>{children}</SidebarShell>;
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
  return <LoginGate />;
}
