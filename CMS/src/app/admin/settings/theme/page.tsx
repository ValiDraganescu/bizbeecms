import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeEditor } from "@/components/settings/theme-editor";
import { getThemeOverrides } from "@/db/settings-store";
import { emptyThemeOverrides } from "@/lib/render/theme";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("theme");
  return { title: t("title") };
}

/**
 * CMS per-Site theme-override settings page (Milestone 2, epic E1). Re-theme the
 * published front-end's purpose color tokens without a rebuild. Explicit
 * `/admin/settings/theme` route → wins over the public `[[...slug]]` catch-all.
 */
export default async function ThemePage() {
  const t = await getTranslations("theme");
  // No D1 binding offline → fall back to empty overrides so the page still
  // renders (live data needs a real binding; see CAVEATS / HITL).
  let initial = emptyThemeOverrides();
  try {
    initial = await getThemeOverrides();
  } catch {
    /* unbound D1 in this env — render defaults */
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
      <ThemeEditor initial={initial} />
    </main>
  );
}
