import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsNav } from "@/components/settings/settings-nav";
import { OpenrouterKeyManager } from "@/components/settings/openrouter-key-manager";
import { checkRoleFromHeaders, canManageUsers } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * Per-Site CMS-local OpenRouter key settings page (ai-openrouter KEY-MINTING
 * track). The operator pastes THEIR OWN OpenRouter key here; it's encrypted at
 * rest in this Site's D1 and preferred at AI request time over the deployed key.
 * Admin/Manager only — mirrors the API-layer `requireUserManager` gate.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("openrouterKey");
  return { title: t("title") };
}

export default async function OpenrouterKeySettingsPage() {
  const t = await getTranslations("openrouterKey");
  const decision = await checkRoleFromHeaders(canManageUsers);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <SettingsNav />
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      {decision.allow ? (
        <OpenrouterKeyManager />
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
