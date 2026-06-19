import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { BlockEditor } from "@/components/pages/block-editor";
import { getPageBlocks, listComponentPalette } from "@/db/page-store";
import { getContentLocales } from "@/db/settings-store";
import { defaultContentLocales } from "@/lib/render/localize";
import type { Block } from "@/lib/render/tree";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageBlocks");
  return { title: t("title") };
}

/**
 * CMS visual block editor (Milestone 2, epic C3) — the NON-AI compose/reorder of
 * a page's block tree, the missing half of C2 (/admin/pages does metadata). Lists
 * the page's current blocks, adds from the component palette, removes, reorders.
 * Explicit route wins over the public `[[...slug]]` catch-all. Persists via the
 * page-store's block write contract (`setPageBlocks`), NOT upsertPageMeta.
 */
export default async function PageBlocksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("pageBlocks");

  // No D1 binding offline → the page is unresolvable, so 404 (live data needs a
  // real binding; the surrounding app builds because other routes degrade).
  let page: { id: string; slug: string; blocks: Block[] } | null = null;
  let palette: { name: string; propsSchema: string | null }[] = [];
  let locales = defaultContentLocales().locales;
  try {
    page = await getPageBlocks(id);
  } catch {
    /* unbound D1 in this env */
  }
  try {
    palette = await listComponentPalette();
  } catch {
    /* unbound D1 — empty palette */
  }
  try {
    locales = (await getContentLocales()).locales;
  } catch {
    /* unbound D1 — default single-locale set */
  }
  if (!page) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-foreground-muted">
            {t("subtitle")} <span className="font-mono text-foreground">/{page.slug}</span>
          </p>
          <a href="/admin/pages" className="mt-2 inline-block text-sm text-primary hover:underline">
            {t("backToPages")}
          </a>
        </div>
        <LocaleSwitcher />
      </header>
      <BlockEditor
        pageId={page.id}
        initialBlocks={page.blocks}
        palette={palette}
        locales={locales}
      />
    </main>
  );
}
