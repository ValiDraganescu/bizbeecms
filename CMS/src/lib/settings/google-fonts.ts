/**
 * Google Fonts css2 URL building + response parsing — PURE module (theme-fonts).
 *
 * The theme-fonts settings route SELF-HOSTS fonts: when a designer picks a
 * catalog family, the server fetches Google's css2 stylesheet ONCE (with a
 * modern-browser UA so it answers with per-subset WOFF2 `@font-face` blocks),
 * downloads the latin + latin-ext files, and stores them in R2. Google is
 * contacted only at SAVE time by the Worker — never by a visitor's browser.
 *
 * This module owns the pure halves (URL build, css2 parse, subset filter) so
 * they run under dep-free `node --test`; the route owns the actual fetches.
 */

/** A parsed css2 `@font-face` block: one downloadable WOFF2 variant. */
export interface RemoteFontFace {
  /** Subset comment preceding the block ("latin", "latin-ext", "cyrillic", …). */
  subset: string;
  style: "normal" | "italic";
  weight: number;
  /** The fonts.gstatic.com WOFF2 URL. */
  url: string;
  unicodeRange?: string;
}

/** Subsets we self-host: base latin + the FI/ET diacritics (ä ö õ š ž). */
export const HOSTED_SUBSETS = ["latin", "latin-ext"] as const;

/**
 * The css2 stylesheet URL for one family at the given weights.
 * `family=Playfair+Display:wght@400;700&display=swap`.
 */
export function buildCss2Url(family: string, weights: number[]): string {
  const fam = family.trim().replace(/ /g, "+");
  const wght = [...new Set(weights)].sort((a, b) => a - b).join(";");
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${wght}&display=swap`;
}

/**
 * A User-Agent modern enough that css2 answers with WOFF2 + unicode-range
 * blocks (an old/unknown UA gets a single TTF fallback instead).
 */
export const CSS2_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Parse a css2 response into its `@font-face` blocks. Tolerant of formatting
 * (Google's output is stable but this only relies on the property shapes);
 * blocks missing a woff2 src or a parsable weight are skipped, never thrown on.
 */
export function parseCss2(cssText: string): RemoteFontFace[] {
  const out: RemoteFontFace[] = [];
  // Each block is preceded by a `/* subset */` comment in css2 output.
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cssText)) !== null) {
    const subset = m[1].toLowerCase();
    const body = m[2];
    const style = /font-style:\s*italic/i.test(body) ? "italic" : "normal";
    const weightM = /font-weight:\s*(\d{3})/i.exec(body);
    const urlM = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/i.exec(body);
    if (!weightM || !urlM) continue;
    const rangeM = /unicode-range:\s*([^;]+);/i.exec(body);
    out.push({
      subset,
      style,
      weight: Number(weightM[1]),
      url: urlM[1],
      unicodeRange: rangeM ? rangeM[1].trim() : undefined,
    });
  }
  return out;
}

/** Keep only the subsets we self-host (latin + latin-ext). */
export function hostedFaces(faces: RemoteFontFace[]): RemoteFontFace[] {
  return faces.filter((f) => (HOSTED_SUBSETS as readonly string[]).includes(f.subset));
}
