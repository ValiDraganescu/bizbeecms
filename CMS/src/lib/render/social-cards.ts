/**
 * Pure builders for OpenGraph + Twitter card metadata on published pages
 * (seo-robots goal). Kept dependency-free (no @/, React, D1, CF imports) so it
 * runs under `node --test`. `generateMetadata` in `(site)/[[...slug]]/page.tsx`
 * feeds it the per-locale meta already loaded on that path — NO new D1 read on
 * the hot path beyond the brand identity read (off the hot path, like the origin
 * read). Output must stay visitor-independent (see seo-robots CAVEATS): every
 * input here derives from stored page/site data, never the request.
 */

/** Subset of Next's `Metadata["openGraph"]` we emit. */
export interface OpenGraphCard {
  title?: string;
  description?: string;
  siteName?: string;
  locale?: string;
  type: "website";
  images?: { url: string }[];
}

/** Subset of Next's `Metadata["twitter"]` we emit. */
export interface TwitterCard {
  card: "summary" | "summary_large_image";
  title?: string;
  description?: string;
  images?: string[];
}

export interface SocialCardInput {
  /** Per-locale meta title, already resolved to the active locale (or undefined). */
  metaTitle?: string;
  /** Per-locale meta description, already resolved (or undefined). */
  metaDescription?: string;
  /** Resolved per-locale OG image URL (absolute or root-relative), or undefined. */
  image?: string;
  /** Brand / Site name from site identity (or "" when unset). */
  brandName?: string;
  /** Active content-locale code (e.g. "en", "fi"), used for og:locale. */
  locale?: string;
}

/** Coerce empty/whitespace strings to undefined so Next omits the key. */
function nonEmpty(v: string | undefined): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/**
 * Build the OpenGraph card from the per-locale meta already resolved on the
 * (site) path. Every field is optional so an unconfigured value simply drops
 * out (Next omits `undefined` keys). Always `type: website` for CMS pages.
 */
export function buildOpenGraph(input: SocialCardInput): OpenGraphCard {
  return {
    type: "website",
    title: nonEmpty(input.metaTitle),
    description: nonEmpty(input.metaDescription),
    siteName: nonEmpty(input.brandName),
    locale: nonEmpty(input.locale),
    images: input.image ? [{ url: input.image }] : undefined,
  };
}

/**
 * Build the Twitter card. `summary_large_image` when the page carries a meta
 * image (so the big preview renders), else the plain `summary`. Title/desc
 * mirror OG; images repeat the OG image URL (Twitter wants a bare string array).
 */
export function buildTwitterCard(input: SocialCardInput): TwitterCard {
  return {
    card: input.image ? "summary_large_image" : "summary",
    title: nonEmpty(input.metaTitle),
    description: nonEmpty(input.metaDescription),
    images: input.image ? [input.image] : undefined,
  };
}
