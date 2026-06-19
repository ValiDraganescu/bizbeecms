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

/**
 * The light-mode default value for every token — a JS mirror of the `:root`
 * block in globals.css. Lets the editor open fully populated (so an author can
 * see and tweak each default) and lets "value === default" be treated as "no
 * override" on save, keeping stored overrides sparse. KEEP IN SYNC with the
 * `:root` `--color-*` declarations; the parity test guards drift.
 */
export const DEFAULT_THEME: Record<ThemeToken, string> = {
  surface: "oklch(0.995 0.001 268)",
  "surface-muted": "oklch(0.968 0.004 268)",
  "surface-raised": "oklch(1 0 0)",
  foreground: "oklch(0.24 0.012 268)",
  "foreground-muted": "oklch(0.5 0.014 268)",
  border: "oklch(0.915 0.006 268)",
  primary: "oklch(0.5 0.19 268)",
  "primary-hover": "oklch(0.43 0.19 268)",
  "primary-foreground": "oklch(0.99 0.002 268)",
  "primary-subtle": "oklch(0.95 0.03 268)",
  danger: "oklch(0.55 0.2 18)",
  "danger-hover": "oklch(0.48 0.2 18)",
  "danger-foreground": "oklch(0.99 0.01 18)",
  "danger-subtle": "oklch(0.955 0.03 18)",
  success: "oklch(0.55 0.13 150)",
  "success-foreground": "oklch(0.99 0.01 150)",
  "success-subtle": "oklch(0.955 0.04 150)",
  warning: "oklch(0.62 0.14 75)",
  "warning-foreground": "oklch(0.99 0.01 75)",
  "warning-subtle": "oklch(0.955 0.05 75)",
  info: "oklch(0.55 0.13 240)",
  "info-foreground": "oklch(0.99 0.01 240)",
  "info-subtle": "oklch(0.955 0.035 240)",
  ring: "oklch(0.5 0.19 268)",
};

/**
 * The DARK-mode default value for every token — a JS mirror of the
 * `[data-theme="dark"]` block in globals.css. Lets the dark-override editor open
 * fully populated with the real dark defaults (so "value === default" stays "no
 * override" and storage stays sparse, same as light). KEEP IN SYNC with the
 * `[data-theme="dark"]` `--color-*` declarations; the parity test guards drift.
 */
export const DARK_DEFAULT_THEME: Record<ThemeToken, string> = {
  surface: "oklch(0.2 0.012 268)",
  "surface-muted": "oklch(0.25 0.014 268)",
  "surface-raised": "oklch(0.275 0.015 268)",
  foreground: "oklch(0.95 0.006 268)",
  "foreground-muted": "oklch(0.7 0.018 268)",
  border: "oklch(0.34 0.016 268)",
  primary: "oklch(0.72 0.15 268)",
  "primary-hover": "oklch(0.79 0.13 268)",
  "primary-foreground": "oklch(0.18 0.03 268)",
  "primary-subtle": "oklch(0.34 0.07 268)",
  danger: "oklch(0.68 0.18 18)",
  "danger-hover": "oklch(0.74 0.16 18)",
  "danger-foreground": "oklch(0.18 0.04 18)",
  "danger-subtle": "oklch(0.36 0.08 18)",
  success: "oklch(0.72 0.14 150)",
  "success-foreground": "oklch(0.18 0.04 150)",
  "success-subtle": "oklch(0.34 0.07 150)",
  warning: "oklch(0.78 0.14 75)",
  "warning-foreground": "oklch(0.2 0.04 75)",
  "warning-subtle": "oklch(0.37 0.07 75)",
  info: "oklch(0.72 0.13 240)",
  "info-foreground": "oklch(0.18 0.04 240)",
  "info-subtle": "oklch(0.34 0.07 240)",
  ring: "oklch(0.72 0.15 268)",
};

/**
 * Predefined palettes an author can apply in one click — each is a COMPLETE,
 * coordinated palette across ALL 24 tokens (not just the brand swatch), so
 * switching presets re-tints surfaces, text, borders, focus ring AND the
 * brand/semantic colors together for a finished look.
 *
 * How each palette is built (so they stay coherent and easy to tune):
 *   - Brand hue H drives `primary*` and `ring`.
 *   - Surfaces / foreground / border carry a *whisper* of H (very low chroma,
 *     ~0.004–0.02) so neutrals feel like they belong to the palette without
 *     turning muddy.
 *   - Semantics keep their MEANING — success≈green(150), warning≈amber(75),
 *     info≈blue(240), danger≈red(18..25) — but their lightness/chroma are tuned
 *     to sit in the palette. Where a semantic hue collides with the brand hue
 *     (crimson↔danger, amber↔warning) the semantic is nudged a few degrees so
 *     the two stay distinguishable.
 *
 * `key` is an i18n label (theme.preset.<key>). All values are oklch and must
 * pass `isSafeColorValue` + survive `normalizeThemeOverrides` unchanged (the
 * THEME_PRESETS test enforces this). The "default" preset clears all overrides.
 */
export const THEME_PRESETS: { key: string; overrides: ThemeOverrides }[] = [
  { key: "default", overrides: {} },
  {
    // Brand hue 160 (green). Slightly cool neutrals, fresh feel.
    key: "emerald",
    overrides: {
      surface: "oklch(0.995 0.003 160)",
      "surface-muted": "oklch(0.965 0.008 160)",
      "surface-raised": "oklch(1 0 0)",
      foreground: "oklch(0.24 0.02 165)",
      "foreground-muted": "oklch(0.5 0.018 165)",
      border: "oklch(0.91 0.012 160)",
      primary: "oklch(0.55 0.14 160)",
      "primary-hover": "oklch(0.48 0.14 160)",
      "primary-foreground": "oklch(0.99 0.01 160)",
      "primary-subtle": "oklch(0.95 0.03 160)",
      danger: "oklch(0.55 0.2 22)",
      "danger-hover": "oklch(0.48 0.2 22)",
      "danger-foreground": "oklch(0.99 0.01 22)",
      "danger-subtle": "oklch(0.955 0.03 22)",
      success: "oklch(0.56 0.14 155)",
      "success-foreground": "oklch(0.99 0.01 155)",
      "success-subtle": "oklch(0.955 0.045 155)",
      warning: "oklch(0.65 0.14 80)",
      "warning-foreground": "oklch(0.24 0.04 80)",
      "warning-subtle": "oklch(0.955 0.05 80)",
      info: "oklch(0.55 0.12 220)",
      "info-foreground": "oklch(0.99 0.01 220)",
      "info-subtle": "oklch(0.955 0.035 220)",
      ring: "oklch(0.55 0.14 160)",
    },
  },
  {
    // Brand hue 18 (red). Warm neutrals; danger nudged to 32 so it differs.
    key: "crimson",
    overrides: {
      surface: "oklch(0.995 0.004 25)",
      "surface-muted": "oklch(0.965 0.01 25)",
      "surface-raised": "oklch(1 0 0)",
      foreground: "oklch(0.24 0.02 25)",
      "foreground-muted": "oklch(0.5 0.02 25)",
      border: "oklch(0.91 0.014 25)",
      primary: "oklch(0.55 0.2 18)",
      "primary-hover": "oklch(0.48 0.2 18)",
      "primary-foreground": "oklch(0.99 0.01 18)",
      "primary-subtle": "oklch(0.955 0.03 18)",
      danger: "oklch(0.52 0.18 32)",
      "danger-hover": "oklch(0.45 0.18 32)",
      "danger-foreground": "oklch(0.99 0.01 32)",
      "danger-subtle": "oklch(0.955 0.035 32)",
      success: "oklch(0.55 0.13 150)",
      "success-foreground": "oklch(0.99 0.01 150)",
      "success-subtle": "oklch(0.955 0.04 150)",
      warning: "oklch(0.64 0.14 70)",
      "warning-foreground": "oklch(0.24 0.04 70)",
      "warning-subtle": "oklch(0.955 0.05 70)",
      info: "oklch(0.55 0.13 240)",
      "info-foreground": "oklch(0.99 0.01 240)",
      "info-subtle": "oklch(0.955 0.035 240)",
      ring: "oklch(0.55 0.2 18)",
    },
  },
  {
    // Brand hue 75 (amber). Brand is light → dark primary-foreground; warning
    // nudged to 55 (toward orange) so it differs from the amber brand.
    key: "amber",
    overrides: {
      surface: "oklch(0.995 0.004 80)",
      "surface-muted": "oklch(0.965 0.01 80)",
      "surface-raised": "oklch(1 0 0)",
      foreground: "oklch(0.25 0.02 80)",
      "foreground-muted": "oklch(0.5 0.02 80)",
      border: "oklch(0.91 0.014 80)",
      primary: "oklch(0.68 0.15 75)",
      "primary-hover": "oklch(0.6 0.15 75)",
      "primary-foreground": "oklch(0.24 0.04 75)",
      "primary-subtle": "oklch(0.955 0.05 75)",
      danger: "oklch(0.55 0.2 22)",
      "danger-hover": "oklch(0.48 0.2 22)",
      "danger-foreground": "oklch(0.99 0.01 22)",
      "danger-subtle": "oklch(0.955 0.03 22)",
      success: "oklch(0.56 0.14 150)",
      "success-foreground": "oklch(0.99 0.01 150)",
      "success-subtle": "oklch(0.955 0.04 150)",
      warning: "oklch(0.62 0.16 55)",
      "warning-foreground": "oklch(0.24 0.04 55)",
      "warning-subtle": "oklch(0.955 0.06 55)",
      info: "oklch(0.55 0.13 235)",
      "info-foreground": "oklch(0.99 0.01 235)",
      "info-subtle": "oklch(0.955 0.035 235)",
      ring: "oklch(0.68 0.15 75)",
    },
  },
  {
    // Brand hue 300 (violet). Cool, slightly purple neutrals.
    key: "violet",
    overrides: {
      surface: "oklch(0.995 0.004 300)",
      "surface-muted": "oklch(0.965 0.01 300)",
      "surface-raised": "oklch(1 0 0)",
      foreground: "oklch(0.24 0.02 300)",
      "foreground-muted": "oklch(0.5 0.02 300)",
      border: "oklch(0.91 0.014 300)",
      primary: "oklch(0.5 0.22 300)",
      "primary-hover": "oklch(0.43 0.22 300)",
      "primary-foreground": "oklch(0.99 0.01 300)",
      "primary-subtle": "oklch(0.95 0.04 300)",
      danger: "oklch(0.55 0.2 18)",
      "danger-hover": "oklch(0.48 0.2 18)",
      "danger-foreground": "oklch(0.99 0.01 18)",
      "danger-subtle": "oklch(0.955 0.03 18)",
      success: "oklch(0.55 0.13 150)",
      "success-foreground": "oklch(0.99 0.01 150)",
      "success-subtle": "oklch(0.955 0.04 150)",
      warning: "oklch(0.64 0.14 75)",
      "warning-foreground": "oklch(0.24 0.04 75)",
      "warning-subtle": "oklch(0.955 0.05 75)",
      info: "oklch(0.55 0.14 270)",
      "info-foreground": "oklch(0.99 0.01 270)",
      "info-subtle": "oklch(0.955 0.04 270)",
      ring: "oklch(0.5 0.22 300)",
    },
  },
  {
    // Brand hue 250 (blue-grey). Near-neutral, professional. Semantics stay
    // saturated so they pop against the muted brand.
    key: "slate",
    overrides: {
      surface: "oklch(0.995 0.002 250)",
      "surface-muted": "oklch(0.965 0.006 250)",
      "surface-raised": "oklch(1 0 0)",
      foreground: "oklch(0.23 0.014 250)",
      "foreground-muted": "oklch(0.5 0.016 250)",
      border: "oklch(0.91 0.008 250)",
      primary: "oklch(0.45 0.03 250)",
      "primary-hover": "oklch(0.38 0.03 250)",
      "primary-foreground": "oklch(0.99 0.005 250)",
      "primary-subtle": "oklch(0.94 0.01 250)",
      danger: "oklch(0.55 0.2 18)",
      "danger-hover": "oklch(0.48 0.2 18)",
      "danger-foreground": "oklch(0.99 0.01 18)",
      "danger-subtle": "oklch(0.955 0.03 18)",
      success: "oklch(0.55 0.13 150)",
      "success-foreground": "oklch(0.99 0.01 150)",
      "success-subtle": "oklch(0.955 0.04 150)",
      warning: "oklch(0.62 0.14 75)",
      "warning-foreground": "oklch(0.24 0.04 75)",
      "warning-subtle": "oklch(0.955 0.05 75)",
      info: "oklch(0.55 0.13 240)",
      "info-foreground": "oklch(0.99 0.01 240)",
      "info-subtle": "oklch(0.955 0.035 240)",
      ring: "oklch(0.45 0.03 250)",
    },
  },
];

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

/** `{tokenA:colorA,…}` → `--color-tokenA:colorA;…` (no wrapping selector). */
function overridesToDecls(overrides: ThemeOverrides): string {
  return Object.entries(overrides)
    .map(([token, value]) => `--color-${token}:${value};`)
    .join("");
}

/**
 * Serialize validated per-Site overrides to inline-<style> CSS rules.
 *
 * LIGHT overrides land under `:root` (the light scope) — they must NOT win in
 * dark mode, or a Site that tweaks one token (e.g. `surface`) would stomp the
 * dark default and the page would never go dark (the P2 dark-background bug).
 * DARK overrides land under BOTH `[data-theme="dark"]` (explicit dark) AND
 * `@media (prefers-color-scheme: dark){[data-theme="system"]}` (OS-driven),
 * mirroring globals.css so a Site can hold DISTINCT values per mode.
 *
 * Returns "" when there's nothing to emit (so the route can skip the element).
 * Re-normalizes defensively so this is safe even if handed unvalidated input.
 */
export function themeOverridesToCss(raw: unknown, rawDark?: unknown): string {
  const light = normalizeThemeOverrides(raw);
  const dark = normalizeThemeOverrides(rawDark);

  let css = "";
  const lightDecls = overridesToDecls(light);
  if (lightDecls) css += `:root{${lightDecls}}`;

  const darkDecls = overridesToDecls(dark);
  if (darkDecls) {
    css += `[data-theme="dark"]{${darkDecls}}`;
    css += `@media (prefers-color-scheme:dark){[data-theme="system"]{${darkDecls}}}`;
  }
  return css;
}
