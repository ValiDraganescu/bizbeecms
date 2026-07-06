import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ExportImportManager } from "@/components/settings/export-import-manager";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("exportImport");
  return { title: t("title") };
}

/**
 * site-export-import — Admin UI (BACKLOG's final API-surface task). Drives the
 * whole export/import protocol client-side: `GET /api/site-export` (+ per-asset
 * `GET /api/site-export/asset/<key>`) for export, and
 * `POST /api/site-import/validate` → typed confirm → `POST /api/site-import` →
 * per-asset `POST /api/site-import/asset/<key>` for import. See
 * `.orchestrator/meeseeks/goals/site-export-import/FORMAT.md` for the wire
 * contract — this page is a thin shell, all the flow logic lives in
 * `ExportImportManager`.
 */
export default async function ExportImportPage() {
  const t = await getTranslations("exportImport");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <ExportImportManager />
    </main>
  );
}
