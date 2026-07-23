/**
 * The builtin "monthly AI quota reached" refusal — PURE (Contract D, W2-D).
 *
 * Admin surfaces get the stable English string `QUOTA_REACHED` verbatim (their
 * clients render `{ error }` as-is and the admin UI is i18n'd on top of it). A
 * GUEST'S browser has no i18n bundle at all — the guest-chat client script
 * renders `j.error` verbatim into the visitor's transcript — so THAT refusal
 * must arrive already translated, resolved here against the request's content
 * locale (`bb_content_locale`, the same cookie the builtin LanguageSwitcher
 * writes and every published page reads).
 *
 * Language coverage matches the rest of the product's shipped translations
 * (en/fi/et, `messages/*.json`) and the fallback chain matches
 * `resolveLocalized`: active locale → the Site's default → English. A visitor on
 * a content locale we don't ship — an operator may configure any code — gets the
 * Site default rather than a raw key.
 *
 * PURE — no `@/`, React, D1, or CF imports, so it runs under the dep-free
 * `node --test` suite.
 */

import { CONTENT_LOCALE_COOKIE } from "../render/plan-language-switcher.ts";

/** What admin JSON refusals carry (the admin clients show it verbatim). */
export const QUOTA_REACHED = "monthly AI quota reached";

/**
 * The guest-visible refusal per content locale. Full sentences, not the terse
 * admin key: this lands in a visitor's chat bubble, where "monthly AI quota
 * reached" is operator jargon.
 */
const GUEST_QUOTA_MESSAGE: Record<string, string> = {
  en: "The assistant has reached its monthly usage limit. Please try again later.",
  fi: "Avustaja on saavuttanut kuukausittaisen käyttörajansa. Yritä myöhemmin uudelleen.",
  et: "Assistent on jõudnud oma igakuise kasutuspiirini. Palun proovi hiljem uuesti.",
};

/**
 * The guest refusal text for a visitor on `locale`. Same fallback chain every
 * localized block prop gets (`resolveLocalized`): active locale → the Site's
 * default locale → English. Locale codes are matched case-insensitively, since
 * the cookie carries whatever the switcher wrote. Always a real sentence.
 */
export function guestQuotaMessage(locale: string, siteDefaultLocale: string): string {
  return (
    GUEST_QUOTA_MESSAGE[locale.toLowerCase()] ??
    GUEST_QUOTA_MESSAGE[siteDefaultLocale.toLowerCase()] ??
    GUEST_QUOTA_MESSAGE.en
  );
}

/**
 * The visitor's chosen content locale from a raw `Cookie` header, or "" when the
 * cookie is absent/blank. The public-chat POST carries the page's cookies, so
 * this is the same signal the page itself rendered in (see
 * `resolveContentLocaleContext`). Only the value is read — validating it against
 * the Site's configured locales is not needed here: an unknown code simply falls
 * through `guestQuotaMessage`'s chain to the Site default.
 */
export function readContentLocaleCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== CONTENT_LOCALE_COOKIE) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return "";
}
