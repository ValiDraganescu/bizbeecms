import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Shell for the unauthenticated auth pages (login / register). A calm, centered
 * single column over the app surface, with the product wordmark and the
 * locale + theme controls available before sign-in.
 */
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("app");

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            {t("name")}
          </span>
          <span className="text-sm text-foreground-muted">
            {t("projectManager")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
