import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { CollectionsManager } from "@/components/content/collections-manager";
import { SqlConsole } from "@/components/content/sql-console";
import { listCollections, type CollectionView } from "@/db/collection-store";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("collections");
  return { title: t("title") };
}

/**
 * content-collections — Slice 5: collections admin index. Lists collections and
 * opens the schema editor (create / add fields / delete). Item CRUD lives on the
 * per-collection detail page. Live data needs a real D1 binding (HITL); offline
 * we render an empty list so the page still builds.
 */
export default async function CollectionsPage() {
  const t = await getTranslations("collections");
  let collections: CollectionView[] = [];
  try {
    collections = await listCollections();
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
      <CollectionsManager initial={collections} />
      <SqlConsole />
    </main>
  );
}
