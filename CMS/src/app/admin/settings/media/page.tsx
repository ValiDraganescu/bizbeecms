import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ImageModelManager } from "@/components/settings/image-model-manager";
import { checkRoleFromHeaders, canManageUsers } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * Media settings page (searchable media library). The operator picks which
 * vision model describes uploaded images for search. Admin/Manager only —
 * mirrors the API-layer `requireUserManager` gate.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("mediaSettings");
  return { title: t("title") };
}

export default async function MediaSettingsPage() {
  const t = await getTranslations("mediaSettings");
  const decision = await checkRoleFromHeaders(canManageUsers);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <SettingsNav />
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      {decision.allow ? (
        <ImageModelManager />
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
