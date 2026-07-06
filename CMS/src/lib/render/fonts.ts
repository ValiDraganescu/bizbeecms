/**
 * Per-Site theme FONTS (theme-fonts) — PURE module.
 *
 * Mirrors the color-token philosophy in `theme.ts`: designers pick fonts for a
 * small set of purpose-named SLOTS (`body`, `heading`, `accent`) instead of
 * hardcoding families in components. Components reference the slot utilities
 * (`font-body` / `font-heading` / `font-accent`, registered in tw-compile), so
 * swapping the theme re-fonts the whole site.
 *
 * Fonts are SELF-HOSTED: at save time the settings route fetches the WOFF2
 * files for the chosen catalog families (latin + latin-ext — Estonian/Finnish
 * need ä ö õ š ž) and stores them as R2 assets; this module only ever emits
 * `@font-face` rules pointing at our own `/media/<key>` URLs. No third-party
 * font CDN at page-load time (GDPR: EU visitors' IPs never reach Google).
 *
 * Security: like theme colors, everything here lands in an inline `<style>`,
 * so family names, weights, styles, unicode ranges and asset keys each pass a
 * narrow grammar; anything else is silently dropped. Kept React/D1/CF-free so
 * it is node-testable (`scripts/fonts.test.mjs`).
 */
import { isValidAssetKey } from "./asset.ts";

// ── Slots ────────────────────────────────────────────────────────────────────

/**
 * The three font slots. Deliberately the ceiling — "one or more fonts, maybe a
 * different one for headings or a bit of text in a hero" is exactly body +
 * heading + accent; more slots would reintroduce per-component font anarchy.
 *  - body:    default for everything (applied to `body`)
 *  - heading: applied to h1–h6
 *  - accent:  applied NOWHERE by default — opt-in via the `font-accent` utility
 */
export const FONT_SLOTS = ["body", "heading", "accent"] as const;
export type FontSlot = (typeof FONT_SLOTS)[number];

const SLOT_SET = new Set<string>(FONT_SLOTS);

export function isFontSlot(name: string): name is FontSlot {
  return SLOT_SET.has(name);
}

// ── Curated catalog ──────────────────────────────────────────────────────────

export type FontCategory = "sans" | "serif" | "display" | "script" | "mono";

export interface CatalogFont {
  /** Google Fonts family name, verbatim (used in the css2 fetch URL). */
  family: string;
  category: FontCategory;
  /** Weights fetched + self-hosted for this family. */
  weights: number[];
}

/**
 * The curated pick list — popular Google families across the five categories.
 * EVERY entry must ship a latin-ext subset (FI/ET diacritics); don't add
 * families without checking. Weights are per-family so display/script faces
 * don't drag unused files along.
 */
export const FONT_CATALOG: CatalogFont[] = [
  // sans
  { family: "Inter", category: "sans", weights: [400, 700] },
  { family: "Roboto", category: "sans", weights: [400, 700] },
  { family: "Open Sans", category: "sans", weights: [400, 700] },
  { family: "Lato", category: "sans", weights: [400, 700] },
  { family: "Montserrat", category: "sans", weights: [400, 700] },
  { family: "Poppins", category: "sans", weights: [400, 600, 700] },
  { family: "Nunito", category: "sans", weights: [400, 700] },
  { family: "Work Sans", category: "sans", weights: [400, 600] },
  { family: "Raleway", category: "sans", weights: [400, 700] },
  { family: "Manrope", category: "sans", weights: [400, 700] },
  { family: "DM Sans", category: "sans", weights: [400, 700] },
  { family: "Figtree", category: "sans", weights: [400, 600] },
  // serif
  { family: "Playfair Display", category: "serif", weights: [400, 700] },
  { family: "Merriweather", category: "serif", weights: [400, 700] },
  { family: "Lora", category: "serif", weights: [400, 600] },
  { family: "PT Serif", category: "serif", weights: [400, 700] },
  { family: "Libre Baskerville", category: "serif", weights: [400, 700] },
  { family: "Cormorant Garamond", category: "serif", weights: [400, 600] },
  { family: "EB Garamond", category: "serif", weights: [400, 600] },
  { family: "Source Serif 4", category: "serif", weights: [400, 600] },
  // display
  { family: "Oswald", category: "display", weights: [400, 600] },
  { family: "Bebas Neue", category: "display", weights: [400] },
  { family: "Archivo Black", category: "display", weights: [400] },
  { family: "Abril Fatface", category: "display", weights: [400] },
  // script
  { family: "Caveat", category: "script", weights: [400, 700] },
  { family: "Dancing Script", category: "script", weights: [400, 700] },
  { family: "Pacifico", category: "script", weights: [400] },
  // mono
  { family: "JetBrains Mono", category: "mono", weights: [400, 700] },
  { family: "IBM Plex Mono", category: "mono", weights: [400, 600] },
];

export function catalogFont(family: string): CatalogFont | null {
  return FONT_CATALOG.find((f) => f.family === family) ?? null;
}

/**
 * System fallback stack per category — every emitted font-family ends in one
 * of these, so a missing/slow WOFF2 degrades to today's system rendering.
 * Sans mirrors the globals.css `--font-sans` stack.
 */
export const FALLBACK_STACKS: Record<FontCategory, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  display: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  script: "cursive",
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
};

// ── Value grammars (the security boundary) ───────────────────────────────────

/**
 * A font family name we are willing to emit (quoted) into an inline <style>:
 * letters/digits/spaces/hyphens only, bounded — no quotes, backslashes, or any
 * declaration-breaking character, so it cannot escape its double quotes.
 */
const FAMILY_RE = /^[a-z0-9][a-z0-9 \-]{0,48}$/i;

export function isSafeFontFamily(name: string): boolean {
  return FAMILY_RE.test(name.trim());
}

/**
 * A `unicode-range` value as Google's css2 emits it: comma-separated
 * `U+xxxx`, `U+xxxx-yyyy`, or `U+xx??` tokens. Nothing else.
 */
const UNICODE_RANGE_RE =
  /^u\+[0-9a-f?]{1,6}(?:-[0-9a-f]{1,6})?(?:\s*,\s*u\+[0-9a-f?]{1,6}(?:-[0-9a-f]{1,6})?)*$/i;

export function isSafeUnicodeRange(value: string): boolean {
  const v = value.trim();
  return v.length <= 512 && UNICODE_RANGE_RE.test(v);
}

// ── Settings shape ───────────────────────────────────────────────────────────

/** One self-hosted @font-face: which family/weight/style a stored R2 file serves. */
export interface FontFace {
  family: string;
  weight: number;
  style: "normal" | "italic";
  /** R2 asset key of the WOFF2 (served at /media/<key>). */
  key: string;
  /** Subset range from css2 (latin / latin-ext files); omitted = all glyphs. */
  unicodeRange?: string;
}

/** The `theme_fonts` settings value: sparse slot picks + the faces backing them. */
export interface ThemeFonts {
  slots: Partial<Record<FontSlot, { family: string }>>;
  faces: FontFace[];
}

export function emptyThemeFonts(): ThemeFonts {
  return { slots: {}, faces: [] };
}

/** Whether any slot is set (callers skip CSS emission entirely when not). */
export function hasThemeFonts(fonts: ThemeFonts): boolean {
  return FONT_SLOTS.some((s) => fonts.slots[s] != null);
}

/**
 * Validate + normalize a raw settings value (parsed JSON or a PUT body).
 * Unknown slots, unsafe families, malformed faces are silently dropped —
 * garbage in → empty config, never a throw. Faces are also capped (a slot pick
 * needs ~a dozen) so a hostile payload can't balloon the inline <style>.
 */
export function normalizeThemeFonts(raw: unknown): ThemeFonts {
  const out = emptyThemeFonts();
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;

  const slots = obj.slots;
  if (slots && typeof slots === "object" && !Array.isArray(slots)) {
    for (const [k, v] of Object.entries(slots as Record<string, unknown>)) {
      if (!isFontSlot(k) || v == null || typeof v !== "object") continue;
      const family = (v as { family?: unknown }).family;
      if (typeof family !== "string" || !isSafeFontFamily(family)) continue;
      out.slots[k] = { family: family.trim() };
    }
  }

  const faces = obj.faces;
  if (Array.isArray(faces)) {
    for (const f of faces.slice(0, 64)) {
      if (f == null || typeof f !== "object") continue;
      const { family, weight, style, key, unicodeRange } = f as Record<string, unknown>;
      if (typeof family !== "string" || !isSafeFontFamily(family)) continue;
      if (typeof weight !== "number" || !Number.isInteger(weight) || weight < 100 || weight > 900) continue;
      if (style !== "normal" && style !== "italic") continue;
      if (typeof key !== "string" || !isValidAssetKey(key)) continue;
      const face: FontFace = { family: family.trim(), weight, style, key };
      if (typeof unicodeRange === "string" && isSafeUnicodeRange(unicodeRange)) {
        face.unicodeRange = unicodeRange.trim();
      }
      out.faces.push(face);
    }
  }
  return out;
}

// ── CSS emission ─────────────────────────────────────────────────────────────

/** The full stack for a family: quoted family + its category's system fallback. */
export function fontStack(family: string): string {
  const cat = catalogFont(family)?.category ?? "sans";
  return `"${family.trim()}", ${FALLBACK_STACKS[cat]}`;
}

/**
 * `@font-face` rules for the stored faces — safe for ANY document (they only
 * declare sources, they don't apply anything), so the admin theme editor can
 * inject them for a true preview. Re-normalizes defensively.
 */
export function fontFacesToCss(raw: unknown): string {
  const { faces } = normalizeThemeFonts(raw);
  return faces
    .map((f) => {
      const range = f.unicodeRange ? `unicode-range:${f.unicodeRange};` : "";
      return (
        `@font-face{font-family:"${f.family}";font-style:${f.style};` +
        `font-weight:${f.weight};font-display:swap;` +
        `src:url(/media/${f.key}) format("woff2");${range}}`
      );
    })
    .join("");
}

/**
 * The full published-page CSS: @font-face rules + `--font-<slot>` variables +
 * the default applications (body → body font, h1–h6 → heading font). The
 * accent slot only defines its variable — application is opt-in via the
 * `font-accent` utility. Injected AFTER the compiled utilities so the
 * variables override tw-compile's registered placeholders. Returns "" when no
 * slot is set.
 */
export function themeFontsToCss(raw: unknown): string {
  const fonts = normalizeThemeFonts(raw);
  if (!hasThemeFonts(fonts)) return "";

  let css = fontFacesToCss(fonts);
  const vars = FONT_SLOTS.filter((s) => fonts.slots[s])
    .map((s) => `--font-${s}:${fontStack(fonts.slots[s]!.family)};`)
    .join("");
  css += `:root{${vars}}`;
  if (fonts.slots.body) css += `body{font-family:var(--font-body);}`;
  if (fonts.slots.heading) {
    css += `h1,h2,h3,h4,h5,h6{font-family:var(--font-heading);}`;
  }
  return css;
}
