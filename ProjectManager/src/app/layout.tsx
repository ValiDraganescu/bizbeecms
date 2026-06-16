import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { ThemeProvider, ThemeScript } from "@/components/theme/theme-provider";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: `${t("name")} — ${t("projectManager")}`,
    description: t("tagline"),
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Locale comes from the cookie/Accept-Language resolver in i18n/request.ts.
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Apply persisted/system theme before paint — no flash. */}
        <ThemeScript />
      </head>
      <body className="min-h-screen bg-surface text-foreground antialiased">
        <NextIntlClientProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
