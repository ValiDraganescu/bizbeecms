/**
 * Root layout for PUBLISHED pages — the (site) route group.
 *
 * Deliberately does NOT use next-intl: the admin-UI locale resolver
 * (NEXT_LOCALE cookie → Accept-Language) must never influence published
 * bytes, or the first visitor's browser language gets baked into
 * edge-cached HTML (cache poisoning — the html[lang] fix in worker.ts was
 * the first instance; the NextIntlClientProvider flight payload serialized
 * the ENTIRE admin messages catalog in the visitor's locale, ~4KB+ of
 * Accept-Language-varying bytes per page). Admin routes live in the
 * (admin) group with their own next-intl root layout.
 *
 * `lang` is stamped with the site's DEFAULT content locale (site config —
 * byte-stable per site, never visitor-varying). For non-default-locale
 * URLs (/fi/…) the custom worker entrypoint (CMS/worker.ts) rewrites
 * html[lang] to the peeled URL locale via HTMLRewriter.
 *
 * Metadata fallback is static English (same strings the admin layout
 * localizes) — a published page without its own metaTitle must not get a
 * visitor-language title.
 */
import "../globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getContentLocales } from "@/db/settings-store";
import en from "../../../messages/en.json";

export const metadata: Metadata = {
  title: `${en.app.name} — ${en.app.cms}`,
  description: en.app.description,
};

export default async function SiteLayout({ children }: { children: ReactNode }) {
  // One D1 settings read; only runs on edge-cache misses once deployed.
  const { default: lang } = await getContentLocales();

  return (
    <html lang={lang} data-theme="system">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
