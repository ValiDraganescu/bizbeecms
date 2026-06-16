/**
 * ProjectManager admin-UI locale config — the single source of truth for the
 * fixed locale set (EN/FI/ET). Distinct from the CMS's per-Site content locales.
 *
 * The PM currently uses a COOKIE-BASED (proxy-free) i18n setup so it builds for
 * Cloudflare Workers via OpenNext (Next 16's proxy is Node-runtime only, which
 * the OpenNext Cloudflare adapter can't bundle yet — see CAVEATS). URLs have no
 * locale prefix; the active locale lives in the `NEXT_LOCALE` cookie.
 *
 * TO SWITCH TO /[locale] PATH ROUTING LATER (when OpenNext supports Next 16
 * proxy): re-add `routing = defineRouting({ locales, defaultLocale,
 * localePrefix: "always" })` + `createNavigation(routing)` here, recreate
 * `src/proxy.ts` with `createMiddleware(routing)`, move pages under
 * `app/[locale]/`, and point `request.ts` at `requestLocale` instead of the
 * cookie. Components (useTranslations/useLocale) and the catalogs stay as-is.
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
