/**
 * Per-Site theme overrides (Milestone 2, epic E1) — PURE module.
 *
 * A Site can re-theme the published front-end WITHOUT a rebuild by overriding
 * the purpose-named CSS color tokens (--color-surface, --color-primary, …). The
 * overrides are stored as one `site_settings` row (key `theme_overrides`) and,
 * at render time, injected as an inline `<style>` AFTER globals.css on the
 * public route, so the cascade lets them win over the defaults. (globals.css
 * already documents this seam.)
 *
 * Security: the values are interpolated into an inline `<style>` element, so a
 * value MUST NOT be able to break out of the CSS declaration (no `}`, `<`, `;`,
 * `@`, comments, or parens used for `url()`/`expression()`). We allowlist BOTH
 * the token name (must be a known purpose token) AND a narrow value grammar
 * (hex / oklch / rgb[a] / hsl[a] / a short list of CSS keywords). Anything else
 * is dropped — never emitted. Kept React/D1/CF-free so it is node-testable
 * (project test convention; see CAVEATS).
 */

// ── Allowlisted token names ──────────────────────────────────────────────────

/**
 * The purpose-named color tokens defined in globals.css. A Site may override any
 * of these; an unknown token name is dropped. Keep in sync with the `@theme`
 * block in `src/app/globals.css` (the `--color-*` variables).
 */
export const THEME_TOKENS = [
  "surface",
  "surface-muted",
  "surface-raised",
  "foreground",
  "foreground-muted",
  "border",
  "primary",
  "primary-hover",
  "primary-foreground",
  "primary-subtle",
  "danger",
  "danger-hover",
  "danger-foreground",
  "danger-subtle",
  "success",
  "success-foreground",
  "success-subtle",
  "warning",
  "warning-foreground",
  "warning-subtle",
  "info",
  "info-foreground",
  "info-subtle",
  "ring",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

const TOKEN_SET = new Set<string>(THEME_TOKENS);

export function isThemeToken(name: string): name is ThemeToken {
  return TOKEN_SET.has(name);
}

// ── Value grammar (the security boundary) ────────────────────────────────────

/**
 * A CSS color VALUE we are willing to emit into an inline <style>. Deliberately
 * narrow — only the shapes a real color uses, none of which contain the
 * declaration/element-terminating characters (`}`, `;`, `<`, `@`, `/*`):
 *   - hex:            #abc | #aabbcc | #aabbccdd
 *   - oklch/lab/lch:  oklch(0.5 0.19 268 / 0.5)   (numbers, %, spaces, one slash)
 *   - rgb/rgba/hsl/hsla: rgb(12 34 56) | rgba(12,34,56,.5) | hsl(210 50% 40%)
 *   - bare keyword:   transparent | currentColor | inherit | white | …
 *
 * Functional forms allow ONLY digits, dot, %, spaces, commas and a single slash
 * inside the parens — so `url(...)`, `expression(...)`, nested functions, and
 * any quote/escape are all rejected. No `var()` (would let a value reference
 * arbitrary props and defeats the point of a fixed token set).
 */
const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_RE = /^(?:oklch|oklab|lab|lch|rgba?|hsla?)\(\s*[0-9.%,\s/]+\)$/i;
const KEYWORD_RE = /^(?:transparent|currentcolor|inherit|initial|unset|revert|none)$/i;
// A named CSS color keyword (e.g. "white", "rebeccapurple"). Letters only,
// bounded length — no separators, so it can't smuggle anything.
const NAMED_COLOR_RE = /^[a-z]{3,20}$/i;

/** Is `value` a color value we will safely emit? Trims first. */
export function isSafeColorValue(value: string): boolean {
  const v = value.trim();
  if (v === "" || v.length > 64) return false;
  // Defence-in-depth: reject the declaration/element breakers outright even if a
  // regex above were loosened later.
  if (/[<>{};@\\"']/.test(v) || v.includes("/*")) return false;
  return (
    HEX_RE.test(v) ||
    FUNC_RE.test(v) ||
    KEYWORD_RE.test(v) ||
    NAMED_COLOR_RE.test(v)
  );
}

// ── Normalize + serialize ────────────────────────────────────────────────────

/** A validated map of token name → color value. */
export type ThemeOverrides = Record<string, string>;

export function emptyThemeOverrides(): ThemeOverrides {
  return {};
}

/**
 * Validate + normalize raw overrides (e.g. parsed from settings JSON or a PUT
 * body). Keeps ONLY entries whose key is a known token AND whose value is a safe
 * color; everything else is silently dropped. Never throws — garbage in → `{}`.
 */
export function normalizeThemeOverrides(raw: unknown): ThemeOverrides {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ThemeOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const token = key.trim();
    if (!isThemeToken(token)) continue;
    const v = value.trim();
    if (!isSafeColorValue(v)) continue;
    out[token] = v;
  }
  return out;
}

/**
 * Serialize validated overrides to a `:root{…}` CSS rule for an inline <style>.
 * Returns "" when there are no overrides (so the route can skip the element).
 * Re-normalizes defensively so this is safe even if handed unvalidated input.
 */
export function themeOverridesToCss(raw: unknown): string {
  const overrides = normalizeThemeOverrides(raw);
  const decls = Object.entries(overrides)
    .map(([token, value]) => `--color-${token}:${value};`)
    .join("");
  return decls === "" ? "" : `:root{${decls}}`;
}
