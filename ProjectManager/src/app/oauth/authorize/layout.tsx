import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Shell for the OAuth consent page: the same calm, centered chrome as the
 * `(auth)` pages (wordmark + locale/theme controls) but one size wider
 * (max-w-md) so the consent card's identity chip and copy have room.
 */
export default async function ConsentLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("app");
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight text-foreground">{t("name")}</span>
          <span className="text-sm text-foreground-muted">{t("projectManager")}</span>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
