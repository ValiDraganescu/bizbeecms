/**
 * Built-in LanguageSwitcher renderer (pure) + its one client script.
 *
 * A renderer primitive (no D1 row) like Section/List. It renders a native
 * `<select>` of the Site's content locales (from `LocaleContext.available`),
 * the active one pre-selected. Since locale-prefix routing (path-locales-edge-cache
 * Stage 1) the URL alone determines the published render, so the client script
 * NAVIGATES: it rewrites the current path under the chosen locale's prefix
 * (default locale = unprefixed) and `location.assign`s it. No cookie is written
 * on published pages — a cookie-influenced response would make default-locale
 * URLs uncacheable at the edge.
 *
 * The admin draft-preview iframe (`/preview/...`) has no locale-prefixed route,
 * so there the script keeps the legacy behavior: write `bb_content_locale` and
 * reload (render-page.tsx's no-explicit-locale path still reads that cookie).
 *
 * Empty/absent `available` (e.g. a single-locale Site, or a path that didn't
 * populate it) → renders nothing: a one-language switcher is noise.
 */

import { type ElementPlan, type LocaleContext, str } from "./plan-types.ts";

/** Cookie the PREVIEW render (no URL locale) reads to pick the content locale.
 *  Published pages no longer read or write it — the URL wins. */
export const CONTENT_LOCALE_COOKIE = "bb_content_locale";

/** Marks the switcher's <select> for the client script to wire. */
const SWITCHER_ATTR = "data-bb-lang-switcher";

/** Carries the Site's DEFAULT locale code so the client can rewrite paths. */
const DEFAULT_LOCALE_ATTR = "data-bb-default-locale";

/**
 * Pure path rewrite for a locale switch — the client-side mirror of
 * `peelLocaleSegment` (slug.ts): strip a leading segment naming a NON-default
 * locale (case-insensitive, URL-decoded), then prefix the target locale unless
 * it's the default. `/fi/about` → et → `/et/about`; → default → `/about`;
 * `/` → fi → `/fi`.
 *
 * SHIPPED VERBATIM to the browser inside LANGUAGE_SWITCHER_SCRIPT via
 * `.toString()` — keep it fully self-contained (no imports, no outer-scope
 * references) and browser-safe.
 */
export function switchLocalePathname(
  pathname: string,
  target: string,
  defaultLocale: string,
  codes: string[],
): string {
  const dec = (s: string): string => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const def = defaultLocale.toLowerCase();
  const segs = pathname.split("/").filter((s) => s.length > 0);
  const first = segs.length > 0 ? dec(segs[0]).trim().toLowerCase() : "";
  // Mirror peelLocaleSegment: only a NON-default locale segment is a prefix.
  if (first !== "" && first !== def && codes.some((c) => c.toLowerCase() === first)) {
    segs.shift();
  }
  if (target.toLowerCase() !== def) segs.unshift(encodeURIComponent(target));
  return "/" + segs.join("/");
}

/**
 * The one client script for every LanguageSwitcher on the page (shipped once).
 * On change: navigate to the same path under the chosen locale's prefix. In the
 * admin preview iframe (no locale routes there) fall back to cookie+reload.
 */
export const LANGUAGE_SWITCHER_SCRIPT = `
(function () {
  var rewrite = ${switchLocalePathname.toString()};
  var cookie = ${JSON.stringify(CONTENT_LOCALE_COOKIE)};
  document.querySelectorAll('[${SWITCHER_ATTR}]').forEach(function (sel) {
    if (sel.__bbWired) return;
    sel.__bbWired = true;
    sel.addEventListener('change', function () {
      if (window.location.pathname.indexOf('/preview/') === 0) {
        // Admin draft preview: no locale-prefixed route exists — legacy
        // cookie+reload keeps the operator's locale flip working there.
        document.cookie = cookie + '=' + encodeURIComponent(sel.value) +
          ';path=/;max-age=31536000;samesite=lax';
        window.location.reload();
        return;
      }
      var codes = Array.prototype.map.call(sel.options, function (o) { return o.value; });
      var path = rewrite(window.location.pathname, sel.value,
        sel.getAttribute('${DEFAULT_LOCALE_ATTR}') || '', codes);
      window.location.assign(path + window.location.search + window.location.hash);
    });
  });
})();
`.trim();

/** Stable asset key so planPage ships the script + no CSS at most once. */
export const LANGUAGE_SWITCHER_ASSET_KEY = "__builtin_language_switcher__";

/**
 * Plan a LanguageSwitcher block into a `<select>` of the content locales.
 * `onUse` is called (once) so the host ships the client script. Returns a
 * hidden placeholder when there are fewer than two locales to switch between.
 */
export function planLanguageSwitcher(
  locale: LocaleContext | undefined,
  onUse: () => void,
): ElementPlan {
  const available = locale?.available ?? [];
  if (available.length < 2) {
    // Nothing to switch — render nothing rather than a dead single-option box.
    return { kind: "element", tag: "div", props: { style: { display: "none" } }, children: [] };
  }
  onUse();

  // Active option is set via the <select>'s defaultValue (the react adapter
  // drops per-<option> `selected` — SSR selection is controlled by the parent).
  // Guard: only select a code that's actually an option, else the first.
  const wanted = str(locale?.locale, "");
  const active = available.some((l) => l.code === wanted) ? wanted : available[0].code;
  const options: ElementPlan[] = available.map((l) => ({
    kind: "element",
    tag: "option",
    props: { value: l.code },
    children: [{ kind: "text", text: l.label }],
  }));

  return {
    kind: "element",
    tag: "select",
    props: {
      [SWITCHER_ATTR]: "",
      // fallback === the Site default locale (see resolveContentLocaleContext).
      [DEFAULT_LOCALE_ATTR]: str(locale?.fallback, ""),
      "aria-label": "Language",
      defaultValue: active,
      className:
        "bb-lang-switcher border border-[color:var(--color-border)] " +
        "bg-[color:var(--color-surface)] text-[color:var(--color-foreground)] " +
        "rounded px-2 py-1 text-sm",
    },
    children: options,
  };
}
