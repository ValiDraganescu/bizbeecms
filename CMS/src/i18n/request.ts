import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import {
  defaultLocale,
  isLocale,
  locales,
  LOCALE_COOKIE,
  type Locale,
} from "./routing";

/**
 * Resolve the active admin-UI locale without locale-based routing:
 *   1. the NEXT_LOCALE cookie (explicit user choice, set by the switcher), then
 *   2. the browser's Accept-Language header (first supported match), then
 *   3. the default locale.
 *
 * Isolated here so a future move to /[locale] path routing only swaps this for
 * `requestLocale` (see routing.ts) — nothing else changes.
 */
async function resolveLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;

  const accept = (await headers()).get("accept-language");
  if (accept) {
    for (const part of accept.split(",")) {
      const tag = part.split(";")[0].trim().toLowerCase();
      const base = tag.split("-")[0];
      if (isLocale(base)) return base;
    }
  }
  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

export { locales };
