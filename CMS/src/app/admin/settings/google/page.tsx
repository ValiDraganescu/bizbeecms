import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsNav } from "@/components/settings/settings-nav";
import { GoogleClientManager } from "@/components/settings/google-client-manager";
import { checkRoleFromHeaders, canManageUsers } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * Per-Site Google sign-in settings page (cms-auth GOOGLE-CLIENT REWORK). The
 * customer enters THEIR OWN Google OAuth client credentials here; the secret is
 * encrypted at rest in this Site's D1. Admin/Manager only — the page mirrors the
 * API-layer `requireUserManager` gate via `checkRoleFromHeaders(canManageUsers)`
 * (the /api/settings/google layer is the real enforcement; this is UI defense).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("googleClient");
  return { title: t("title") };
}

export default async function GoogleSettingsPage() {
  const t = await getTranslations("googleClient");
  const decision = await checkRoleFromHeaders(canManageUsers);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <SettingsNav />
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      {decision.allow ? (
        <GoogleClientManager />
      ) : (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {t("forbidden")}
        </p>
      )}
    </main>
  );
}
