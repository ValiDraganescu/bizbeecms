import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LlmsEditor } from "@/components/settings/llms-editor";
import { getLlmsTemplate } from "@/db/settings-store";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("llms");
  return { title: t("title") };
}

/**
 * CMS llms.txt template settings page (seo-robots goal). View / edit the
 * free-text template served at `/llms.txt`. Explicit `/admin/settings/llms`
 * route → wins over the public `[[...slug]]` catch-all.
 */
export default async function LlmsSettingsPage() {
  const t = await getTranslations("llms");
  // No D1 binding offline → empty template so the page still renders.
  let initial = "";
  try {
    initial = await getLlmsTemplate();
  } catch {
    /* unbound D1 in this env — render empty */
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <LlmsEditor initial={initial} />
    </main>
  );
}
