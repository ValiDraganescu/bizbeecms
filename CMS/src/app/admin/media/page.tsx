import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { MediaGallery } from "@/components/media/media-gallery";
import { listAssets } from "@/db/asset-store";
import { assetUrl } from "@/lib/render/asset";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("media");
  return { title: t("title") };
}

/**
 * CMS media library page (Milestone 2, epic D1). Upload images to the per-Site
 * R2 bucket and browse them; each yields a `/media/<key>` URL a component can
 * reference. Explicit `/admin/media` route → wins over the public `[[...slug]]`
 * catch-all (Next route precedence). Loads the list server-side; falls back to
 * an empty gallery offline (no R2/D1 binding in this env — see CAVEATS / HITL).
 */
export default async function MediaPage() {
  const t = await getTranslations("media");
  let initial: { key: string; filename: string; contentType: string; size: number; url: string }[] = [];
  try {
    const rows = await listAssets();
    initial = rows.map((a) => ({
      key: a.key,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      url: assetUrl(a.key),
    }));
  } catch {
    /* unbound R2/D1 in this env — render an empty gallery */
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
        </div>
        <LocaleSwitcher />
      </header>
      <MediaGallery initial={initial} />
    </main>
  );
}
