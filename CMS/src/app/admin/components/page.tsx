import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ComponentsGallery } from "@/components/components/components-gallery";
import { listComponents } from "@/db/component-store";
import { parseTags } from "@/lib/components/tags";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("components");
  return { title: t("title") };
}

/**
 * CMS components admin UI — a preview-led gallery (components-gallery). Each
 * card shows a live scaled preview and doubles as the pick affordance; the
 * selection exports as ONE `.kit.zip` (components + asset bytes), and the
 * import section accepts `.kit.zip` or bare JSON bundles. Explicit
 * `/admin/components` route wins over the public `[[...slug]]` catch-all.
 */
export default async function ComponentsPage() {
  const t = await getTranslations("components");
  // No D1 binding offline → render an empty list so the page still builds.
  let initial: {
    name: string;
    hasScript: boolean;
    hasCss: boolean;
    tags: string[];
    label?: string | null;
    version: number;
  }[] = [];
  try {
    const rows = await listComponents();
    initial = rows.map((r) => ({
      name: r.name,
      hasScript: (r.script ?? "") !== "",
      hasCss: (r.css ?? "") !== "",
      tags: parseTags(r.tags),
      label: r.label ?? null,
      version: r.updatedAt?.getTime() ?? 0,
    }));
  } catch {
    /* unbound D1 in this env — render empty */
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
        </div>
        <LocaleSwitcher />
      </header>
      <ComponentsGallery initialComponents={initial} />
    </main>
  );
}
