import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ThemeEditor } from "@/components/settings/theme-editor";
import { FontsEditor } from "@/components/settings/fonts-editor";
import {
  getThemeFonts,
  getThemeOverrides,
  getThemeOverridesDark,
} from "@/db/settings-store";
import { emptyThemeOverrides } from "@/lib/render/theme";
import { emptyThemeFonts } from "@/lib/render/fonts";

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
  let initialDark = emptyThemeOverrides();
  let initialFonts = emptyThemeFonts();
  try {
    [initial, initialDark, initialFonts] = await Promise.all([
      getThemeOverrides(),
      getThemeOverridesDark(),
      getThemeFonts(),
    ]);
  } catch {
    /* unbound D1 in this env — render defaults */
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <ThemeEditor initial={initial} initialDark={initialDark} />
      <FontsEditor initial={initialFonts} />
    </main>
  );
}
