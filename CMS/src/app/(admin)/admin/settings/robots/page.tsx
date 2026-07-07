import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RobotsEditor } from "@/components/settings/robots-editor";
import { getRobotsConfig } from "@/db/settings-store";
import { defaultRobotsConfig } from "@/lib/render/robots-txt";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("robots");
  return { title: t("title") };
}

/**
 * CMS robots.txt settings page (seo-robots goal). View / edit the per-Site
 * crawler rules served at `/robots.txt`. Explicit `/admin/settings/robots`
 * route → wins over the public `[[...slug]]` catch-all.
 */
export default async function RobotsSettingsPage() {
  const t = await getTranslations("robots");
  // No D1 binding offline → seeded default so the page still renders.
  let initial = defaultRobotsConfig();
  try {
    initial = await getRobotsConfig();
  } catch {
    /* unbound D1 in this env — render defaults */
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <RobotsEditor initial={initial} />
    </main>
  );
}
