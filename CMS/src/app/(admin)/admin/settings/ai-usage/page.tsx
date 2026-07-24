import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AiUsageView } from "@/components/settings/ai-usage-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aiUsage");
  return { title: t("title") };
}

/**
 * AI credits & usage settings page (ai-usage-settings-page) — the centralized
 * view of the Site's allocated monthly AI credits, month-to-date and all-time
 * billable spend, the last-30-days series and the per-purpose breakdown.
 * Admin-gated by the (admin)/admin layout; the data route re-enforces with
 * `requireAdmin`. The view fetches `/api/ai-usage/summary` client-side — no D1
 * binding needed for the initial render. Explicit route → wins over the public
 * `[[...slug]]` catch-all.
 */
export default async function AiUsagePage() {
  const t = await getTranslations("aiUsage");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <AiUsageView />
    </main>
  );
}
