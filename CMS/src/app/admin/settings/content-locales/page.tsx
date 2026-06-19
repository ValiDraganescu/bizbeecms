import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ContentLocalesEditor } from "@/components/settings/content-locales-editor";
import { getContentLocales } from "@/db/settings-store";
import { defaultContentLocales } from "@/lib/render/localize";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contentLocales");
  return { title: t("title") };
}

/**
 * CMS content-locale settings page (Milestone 2, epic C1b). View / add / remove
 * the per-Site user-facing content languages (distinct from the EN/FI/ET admin
 * UI). Explicit `/admin/settings/content-locales` route → wins over the public
 * `[[...slug]]` catch-all (Next route precedence).
 */
export default async function ContentLocalesPage() {
  const t = await getTranslations("contentLocales");
  // No D1 binding offline → fall back to the safe default config so the page
  // still renders (live data needs a real binding; see CAVEATS / HITL).
  let initial = defaultContentLocales();
  try {
    initial = await getContentLocales();
  } catch {
    /* unbound D1 in this env — render defaults */
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <SettingsNav />
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <ContentLocalesEditor initial={initial} />
    </main>
  );
}
