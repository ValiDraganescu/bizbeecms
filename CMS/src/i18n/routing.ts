/**
 * CMS admin-UI locale config — the single source of truth for the fixed
 * admin-UI locale set (EN/FI/ET). This is the CMS's own UI chrome locale; it is
 * DISTINCT from the per-Site, data-driven user-facing CONTENT locales the CMS
 * will additionally support (those are arbitrary and configured per Site).
 *
 * Cookie-based (proxy-free) like the ProjectManager, so it builds for Cloudflare
 * Workers via OpenNext (Next 16's proxy is Node-runtime only, which the OpenNext
 * Cloudflare adapter can't bundle yet). URLs carry no locale prefix; the active
 * admin locale lives in the `NEXT_LOCALE` cookie.
 *
 * TO SWITCH TO /[locale] PATH ROUTING LATER (when OpenNext supports Next 16
 * proxy): re-add `defineRouting`/`createNavigation`, recreate `src/proxy.ts`,
 * move pages under `app/[locale]/`, and point `request.ts` at `requestLocale`.
 * Components and catalogs stay as-is. (Mirrors ProjectManager exactly.)
 */

export const locales = ["en", "fi", "et"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie next-intl reads/writes for the active locale (its default name). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Human labels for the locale switcher (each in its own language). */
export const localeNames: Record<Locale, string> = {
  en: "English",
  fi: "Suomi",
  et: "Eesti",
};

export function isLocale(value: string | undefined): value is Locale {
  return value != null && (locales as readonly string[]).includes(value);
}
