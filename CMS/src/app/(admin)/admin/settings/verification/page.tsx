import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VerificationEditor } from "@/components/settings/verification-editor";
import { getSiteVerification } from "@/db/settings-store";
import { emptySiteVerification } from "@/lib/render/site-verification";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("verification");
  return { title: t("title") };
}

/**
 * CMS search-engine verification settings page (seo-robots goal). View / edit
 * the per-Site Google / Bing / Yandex site-verification tokens emitted as
 * `<meta>` tags on published pages. Explicit `/admin/settings/verification`
 * route → wins over the public `[[...slug]]` catch-all.
 */
export default async function VerificationSettingsPage() {
  const t = await getTranslations("verification");
  // No D1 binding offline → empty tokens so the page still renders.
  let initial = emptySiteVerification();
  try {
    initial = await getSiteVerification();
  } catch {
    /* unbound D1 in this env — render empty */
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <VerificationEditor initial={initial} />
    </main>
  );
}
