/**
 * Built-in LanguageSwitcher renderer (pure) + its one client script.
 *
 * A renderer primitive (no D1 row) like Section/List. It renders a native
 * `<select>` of the Site's content locales (from `LocaleContext.available`),
 * the active one pre-selected. The client script (shipped once when a switcher
 * is on the page) writes the chosen code to the `bb_content_locale` cookie and
 * reloads, so the page re-renders in that locale and the choice persists across
 * refreshes. Theme-token styled — no color literals.
 *
 * Empty/absent `available` (e.g. a single-locale Site, or a path that didn't
 * populate it) → renders nothing: a one-language switcher is noise.
 */

import { type ElementPlan, type LocaleContext, str } from "./plan-types.ts";

/** Cookie the published render reads to pick the active content locale. */
export const CONTENT_LOCALE_COOKIE = "bb_content_locale";

/** Marks the switcher's <select> for the client script to wire. */
const SWITCHER_ATTR = "data-bb-lang-switcher";

/**
 * The one client script for every LanguageSwitcher on the page (shipped once).
 * On change: persist the choice for a year, then reload so the server re-renders
 * the whole page in the new locale. Cookie is path=/ so it applies site-wide.
 */
export const LANGUAGE_SWITCHER_SCRIPT = `
(function () {
  var cookie = ${JSON.stringify(CONTENT_LOCALE_COOKIE)};
  document.querySelectorAll('[${SWITCHER_ATTR}]').forEach(function (sel) {
    if (sel.__bbWired) return;
    sel.__bbWired = true;
    sel.addEventListener('change', function () {
      document.cookie = cookie + '=' + encodeURIComponent(sel.value) +
        ';path=/;max-age=31536000;samesite=lax';
      window.location.reload();
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
