import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RedirectsEditor } from "@/components/settings/redirects-editor";
import { listRedirects } from "@/db/redirect-store";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("redirects");
  return { title: t("title") };
}

/**
 * CMS manual redirects settings page (seo-robots goal, 301-redirects track #3).
 * View / add / delete the URL redirects served by the `(site)` catch-all.
 * Explicit `/admin/settings/redirects` route → wins over the public catch-all.
 */
export default async function RedirectsSettingsPage() {
  const t = await getTranslations("redirects");
  // No D1 binding offline → empty list so the page still renders.
  let initial: Awaited<ReturnType<typeof listRedirects>> = [];
  try {
    initial = await listRedirects();
  } catch {
    /* unbound D1 in this env — render empty */
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <RedirectsEditor initial={initial} />
    </main>
  );
}
