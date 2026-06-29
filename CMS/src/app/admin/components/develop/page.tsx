import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ComponentDevelop } from "@/components/components/component-develop";
import { listComponents } from "@/db/component-store";
import { normalizeTags } from "@/lib/components/tags";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("develop");
  return { title: t("title") };
}

/**
 * Component "Develop" workbench: a two-column list + live preview surface for
 * working on the component system — select a component to preview it (rendered
 * with its placeholder data), or delete unwanted ones. Sibling of the
 * export/import page under the Components nav group.
 */
export default async function ComponentDevelopPage() {
  const t = await getTranslations("develop");
  let initial: {
    name: string;
    hasScript: boolean;
    hasCss: boolean;
    hasPreviewData: boolean;
    tags: string[];
  }[] = [];
  try {
    const rows = await listComponents();
    initial = rows.map((r) => ({
      name: r.name,
      hasScript: (r.script ?? "") !== "",
      hasCss: (r.css ?? "") !== "",
      hasPreviewData: (r.propsSchema ?? "") !== "",
      tags: normalizeTags(r.tags),
    }));
  } catch {
    /* unbound D1 in this env — render empty */
  }

  return (
    <main className="flex h-full flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
        </div>
        <LocaleSwitcher />
      </header>
      <ComponentDevelop initialComponents={initial} />
    </main>
  );
}
