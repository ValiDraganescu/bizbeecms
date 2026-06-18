import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { PagesManager } from "@/components/pages/pages-manager";
import { listPages, type PageSummary } from "@/db/page-store";
import { getContentLocales } from "@/db/settings-store";
import { defaultContentLocales } from "@/lib/render/localize";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages");
  return { title: t("title") };
}

/**
 * CMS page-management admin UI (Milestone 2, epic C2) — the NON-AI counterpart
 * to the create_page AI tool: list / create / edit / delete pages (slug, parent,
 * publish status, per-locale SEO). Explicit `/admin/pages` route wins over the
 * public `[[...slug]]` catch-all. Blocks are edited by the AI / C3, not here.
 */
export default async function PagesPage() {
  const t = await getTranslations("pages");
  // No D1 binding offline → render an empty list + default content locales so the
  // page still builds (live data needs a real binding; see CAVEATS / HITL).
  let pages: PageSummary[] = [];
  let locales = defaultContentLocales().locales;
  try {
    pages = await listPages();
  } catch {
    /* unbound D1 in this env — render empty */
  }
  try {
    locales = (await getContentLocales()).locales;
  } catch {
    /* unbound D1 — render default locale set */
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
      <PagesManager initialPages={pages} locales={locales} />
    </main>
  );
}
