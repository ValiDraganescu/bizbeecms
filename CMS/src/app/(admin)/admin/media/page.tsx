import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { MediaLibrary } from "@/components/media/media-library";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("media");
  return { title: t("title") };
}

/**
 * CMS media library page — the shared `MediaLibrary` in manage mode: search,
 * upload, paginated grid, right-side details rail (tags/description/metadata)
 * and lightbox. Explicit `/admin/media` route → wins over the public
 * `[[...slug]]` catch-all (Next route precedence). The library fetches its own
 * list from `/api/assets` (same path the picker modal uses).
 */
export default async function MediaPage() {
  const t = await getTranslations("media");
  return (
    <main className="mx-auto flex h-[calc(100dvh-2rem)] max-w-6xl flex-col gap-4 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
        </div>
        <LocaleSwitcher />
      </header>
      <MediaLibrary
        mode="manage"
        className="min-h-0 flex-1 rounded-lg border border-border bg-surface-raised"
      />
    </main>
  );
}
