import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { DataSourcesManager } from "@/components/content/data-sources-manager";
import { checkAdminFromHeaders } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * external-data-sources Slice 4 — the CENTRAL management UI for external API
 * data sources: sources (auth + write-only secret) and their saved requests
 * (method/path/query/body templates, per-request cache config, test calls).
 * Admin only — the /api/data-sources layer is the real enforcement; this gate
 * is UI defense (google-settings pattern).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dataSources");
  return { title: t("title") };
}

export default async function DataSourcesPage() {
  const t = await getTranslations("dataSources");
  const decision = await checkAdminFromHeaders();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
        </div>
        <LocaleSwitcher />
      </header>
      {decision.allow ? (
        <DataSourcesManager />
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
