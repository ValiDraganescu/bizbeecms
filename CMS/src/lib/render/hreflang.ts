/**
 * hreflang / canonical path building for locale-prefixed routes
 * (path-locales-edge-cache Stage 1 — SEO slice).
 *
 * Given the raw URL segments of a public page request, compute the page's path
 * under EVERY configured content locale: the default locale stays UNPREFIXED
 * (`/about`), non-default locales get a `/<code>/` prefix (`/fi/about`). The
 * root maps to `/` (default) and `/fi` (no trailing slash — `/fi/` triggers
 * Next's 308 trailing-slash redirect, observed live; see CAVEATS).
 *
 * Stage 2 (localized slugs): a page may answer to a DIFFERENT slug per locale
 * (fi: "ehdot"), so a prefix-only rewrite of the request's chain 404s there.
 * Two seams handle it:
 * - `pathForLocale` takes an optional `translate` (localize-paths
 *   createPathTranslator) mapping the DEFAULT-locale path to the target
 *   locale's slug chain before prefixing — used by app/sitemap.ts, whose
 *   input segments ARE the default chain.
 * - `hreflangAlternates` takes optional plan-time `pagePaths`
 *   (LocaleContext.pagePaths — the page's FULL per-locale pathname, already
 *   translated + prefixed); entries win over the prefix-only fallback. Needed
 *   because generateMetadata's request segments are the ACTIVE locale's chain,
 *   not the default one.
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`.
 */

import { peelLocaleSegment } from "./slug.ts";

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * The path of the page at `rest` (DEFAULT-locale slug segments) under `code`.
 * Segments are normalized (decode → re-encode) so encoded and decoded inputs
 * produce the same URL. Optional `translate` (Stage 2) rewrites the
 * default-locale path into the target locale's slug chain BEFORE prefixing;
 * without it the rewrite is prefix-only (Stage 1 behavior).
 */
export function pathForLocale(
  rest: string[],
  code: string,
  defaultLocale: string,
  translate?: (path: string, locale: string) => string,
): string {
  const tail = rest
    .map((s) => encodeURIComponent(safeDecode(s)))
    .filter((s) => s.length > 0)
    .join("/");
  const defaultPath = tail ? `/${tail}` : "/";
  if (code.toLowerCase() === defaultLocale.toLowerCase()) return defaultPath;
  const translated = translate ? translate(defaultPath, code) : defaultPath;
  const prefix = `/${encodeURIComponent(code)}`;
  return translated === "/" ? prefix : `${prefix}${translated}`;
}

/**
 * Canonical + hreflang alternate paths for one request.
 *
 * - `canonical` — the requested URL's own normalized path (the active locale's
 *   variant; a page is canonical to itself per locale, per Google's hreflang
 *   guidance — alternates handle the cross-locale relation).
 * - `languages` — hreflang code → path for every configured locale, plus
 *   `x-default` pointing at the default (unprefixed) variant. EMPTY when only
 *   one locale is configured (hreflang for a single language is noise).
 *
 * Optional `pagePaths` (plan-time LocaleContext.pagePaths, keyed by configured
 * code) carries the page's FULL per-locale pathname under localized slugs —
 * an entry wins over the prefix-only rewrite; missing entries/map fall back
 * (best-effort, same as the LanguageSwitcher's client fallback).
 */
export function hreflangAlternates(
  segments: string[] | undefined,
  locales: string[],
  defaultLocale: string,
  pagePaths?: Record<string, string>,
): { canonical: string; languages: Record<string, string> } {
  const { locale, rest } = peelLocaleSegment(segments, locales, defaultLocale);
  const pathFor = (code: string) =>
    pagePaths?.[code] ?? pathForLocale(rest, code, defaultLocale);
  const canonical = pathFor(locale);
  const languages: Record<string, string> = {};
  if (locales.length > 1) {
    for (const code of locales) {
      languages[code] = pathFor(code);
    }
    languages["x-default"] = pathFor(defaultLocale);
  }
  return { canonical, languages };
}
