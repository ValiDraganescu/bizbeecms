import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RateLimitEditor } from "@/components/settings/rate-limit-editor";
import { getRateLimitPreset } from "@/db/settings-store";
import { DEFAULT_RATE_LIMIT_PRESET } from "@/lib/render/rate-limit-config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rateLimit");
  return { title: t("title") };
}

/**
 * CMS naughty-robot rate-limit threshold settings page (seo-robots track 2/2).
 * Pick the per-Site preset (off / normal / strict) that gates the worker's per-IP
 * rate limiter. Explicit `/admin/settings/rate-limit` route → wins over the public
 * `[[...slug]]` catch-all.
 */
export default async function RateLimitSettingsPage() {
  const t = await getTranslations("rateLimit");
  // No D1 binding offline → default preset so the page still renders.
  let initial = DEFAULT_RATE_LIMIT_PRESET;
  try {
    initial = await getRateLimitPreset();
  } catch {
    /* unbound D1 in this env — render the default */
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <RateLimitEditor initial={initial} />
    </main>
  );
}
