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
 * Stage 2 (localized slugs) NOTE: these are prefix-only rewrites of the SAME
 * slug chain. Once `page.localized_slugs` lands, alternates must emit each
 * locale's translated slug chain instead (see backlog).
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
 * The path of the page at `rest` (locale-free slug segments) under `code`.
 * Segments are normalized (decode → re-encode) so encoded and decoded inputs
 * produce the same URL.
 */
export function pathForLocale(
  rest: string[],
  code: string,
  defaultLocale: string,
): string {
  const tail = rest
    .map((s) => encodeURIComponent(safeDecode(s)))
    .filter((s) => s.length > 0)
    .join("/");
  if (code.toLowerCase() === defaultLocale.toLowerCase()) {
    return tail ? `/${tail}` : "/";
  }
  const prefix = `/${encodeURIComponent(code)}`;
  return tail ? `${prefix}/${tail}` : prefix;
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
 */
export function hreflangAlternates(
  segments: string[] | undefined,
  locales: string[],
  defaultLocale: string,
): { canonical: string; languages: Record<string, string> } {
  const { locale, rest } = peelLocaleSegment(segments, locales, defaultLocale);
  const canonical = pathForLocale(rest, locale, defaultLocale);
  const languages: Record<string, string> = {};
  if (locales.length > 1) {
    for (const code of locales) {
      languages[code] = pathForLocale(rest, code, defaultLocale);
    }
    languages["x-default"] = pathForLocale(rest, defaultLocale, defaultLocale);
  }
  return { canonical, languages };
}
