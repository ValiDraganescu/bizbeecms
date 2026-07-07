import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotFoundPageEditor } from "@/components/settings/not-found-page-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notFoundPage");
  return { title: t("title") };
}

/**
 * CMS branded-404 settings page (seo-robots goal). Choose which published page
 * the site serves as its 404. Explicit `/admin/settings/not-found-page` route →
 * wins over the public `[[...slug]]` catch-all. The editor fetches its own data
 * client-side (published-page options + current id), so this page is thin.
 */
export default async function NotFoundPageSettingsPage() {
  const t = await getTranslations("notFoundPage");
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <NotFoundPageEditor />
    </main>
  );
}
