import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ComponentsManager } from "@/components/components/components-manager";
import { listComponents } from "@/db/component-store";
import { normalizeTags } from "@/lib/components/tags";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("components");
  return { title: t("title") };
}

/**
 * CMS component export/import admin UI (Milestone 2, epic H1/H2). Lists the
 * Site's components with an "Export" button each (downloads a portable JSON
 * bundle) and an import box (paste JSON or upload a `.json` file). Explicit
 * `/admin/components` route wins over the public `[[...slug]]` catch-all.
 */
export default async function ComponentsPage() {
  const t = await getTranslations("components");
  // No D1 binding offline → render an empty list so the page still builds.
  let initial: { name: string; hasScript: boolean; hasCss: boolean; tags: string[] }[] = [];
  try {
    const rows = await listComponents();
    initial = rows.map((r) => ({
      name: r.name,
      hasScript: (r.script ?? "") !== "",
      hasCss: (r.css ?? "") !== "",
      tags: normalizeTags(r.tags),
    }));
  } catch {
    /* unbound D1 in this env — render empty */
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
        </div>
        <LocaleSwitcher />
      </header>
      <ComponentsManager initialComponents={initial} />
    </main>
  );
}
