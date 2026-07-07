import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { CollectionItems } from "@/components/content/collection-items";
import { getCollection, listCollections, type CollectionView } from "@/db/collection-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  return { title: name };
}

/**
 * content-collections — Slice 5: per-collection item manager. `[name]` is the
 * `content_<slug>` table name (mirrors the API). Loads the collection's schema
 * server-side; the client component does the item CRUD + filter/sort/search via
 * the Slice-4 query route. Offline (no D1 binding) → a friendly notice instead of
 * crashing the build.
 */
export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const t = await getTranslations("collections");

  let collection: CollectionView | null = null;
  let all: CollectionView[] = [];
  let bound = true;
  try {
    collection = await getCollection(name);
    all = await listCollections();
  } catch {
    bound = false; // unbound D1 in this env
  }

  if (bound && !collection) notFound();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/collections" className="text-sm text-foreground-muted hover:text-foreground">
            ← {t("title")}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{collection?.name ?? name}</h1>
          <p className="font-mono text-sm text-foreground-muted">{name}</p>
        </div>
        <LocaleSwitcher />
      </header>

      {collection ? (
        <CollectionItems collection={collection} allCollections={all} />
      ) : (
        <p className="rounded-md border border-border bg-surface-raised p-4 text-foreground-muted">
          {t("offline")}
        </p>
      )}
    </main>
  );
}
