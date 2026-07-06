import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BrandEditor } from "@/components/settings/brand-editor";
import { getSiteIdentity } from "@/db/settings-store";
import { emptySiteIdentity } from "@/lib/settings/site-settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brand");
  return { title: t("title") };
}

/**
 * CMS per-Site brand/design/AI-persona settings page (Milestone 2, epic E2).
 * The author describes the Site's identity once; it feeds the AI system prompt.
 * Explicit `/admin/settings/brand` route → wins over the public `[[...slug]]`.
 */
export default async function BrandPage() {
  const t = await getTranslations("brand");
  // No D1 binding offline → fall back to an empty identity so the page still
  // renders (live data needs a real binding; see CAVEATS / HITL).
  let initial = emptySiteIdentity();
  try {
    initial = await getSiteIdentity();
  } catch {
    /* unbound D1 in this env — render defaults */
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <BrandEditor initial={initial} />
    </main>
  );
}
