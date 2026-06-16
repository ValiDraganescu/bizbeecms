import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider, ThemeScript } from "@/components/theme/theme-provider";

export const metadata: Metadata = {
  title: "bizbeecms — ProjectManager",
  description: "Cloudflare-native multi-site B2B whitelabel CMS — ProjectManager",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply persisted/system theme before paint — no flash. */}
        <ThemeScript />
      </head>
      <body className="min-h-screen bg-surface text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
