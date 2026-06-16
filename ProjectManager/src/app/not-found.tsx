import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * Not-found page. Rendered inside the root layout (which provides <html>/<body>
 * and the i18n provider), so it's localized and themed like any other page.
 */
export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium text-foreground-muted">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <Link
        href="/"
        className="mt-1 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("home")}
      </Link>
    </main>
  );
}
