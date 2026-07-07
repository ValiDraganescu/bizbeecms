/**
 * Reverse-resolve internal paths under LOCALIZED SLUGS
 * (path-locales-edge-cache Stage 2).
 *
 * Internal `href`s are authored in the DEFAULT locale's slug chain
 * (`/about/team`). Once a page carries a per-locale slug override
 * (fi: "meista"), the locale-aware walk 404s the default slug in that locale —
 * so a prefix-only rewrite (`/fi/about/team`) breaks. This module translates a
 * default-locale path into the ACTIVE locale's slug chain by walking the page
 * tree: match each segment against the siblings' DEFAULT slugs, re-emit each
 * matched page's `effectiveSlug` for the target locale. Best-effort — segments
 * that match no page (old links, wildcard values, external chains) pass
 * through unchanged, exactly like before.
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`.
 */

import { HOME_SLUG, effectiveSlug, isParamSlug, paramName } from "./slug.ts";

/** The page columns path translation needs (real `Page` rows satisfy this). */
export interface PathPageRow {
  id: string;
  slug: string;
  parentPageId: string | null;
  /** Raw `page.localized_slugs` JSON text, as stored. */
  localizedSlugs?: string | null;
}

/** Translate a DEFAULT-locale internal path into `locale`'s slug chain. */
export type PathTranslator = (path: string, locale: string) => string;

const ROOT_KEY = "";

/**
 * `pageId` plus every descendant id (children, grandchildren, …) in `rows`.
 * A slug/parent edit on one page shifts the URL of its whole subtree, so the
 * rename auto-capture needs the full set. Cycle-safe (a `seen` guard). PURE.
 */
export function descendantIds(rows: PathPageRow[], pageId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parentPageId === null) continue;
    const list = childrenOf.get(r.parentPageId);
    if (list) list.push(r.id);
    else childrenOf.set(r.parentPageId, [r.id]);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [pageId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child);
  }
  return out;
}

/** parentPageId (null → "") → child rows, for the segment-by-segment walk. */
function childrenIndex(rows: PathPageRow[]): Map<string, PathPageRow[]> {
  const byParent = new Map<string, PathPageRow[]>();
  for (const row of rows) {
    const key = row.parentPageId ?? ROOT_KEY;
    const list = byParent.get(key);
    if (list) list.push(row);
    else byParent.set(key, [row]);
  }
  return byParent;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Build a translator over the Site's page rows (one query per render; the
 * table is small). `translate(path, locale)`:
 * - target locale = the default (case-insensitive) → path unchanged;
 * - splits off `?query#hash` untouched; walks the pathname segments;
 * - each segment matches a sibling by its DEFAULT slug (URL-decoded) and is
 *   re-emitted as that page's `effectiveSlug` in the target locale (the
 *   original raw segment is kept when there's no override — zero churn);
 * - a segment matching no default slug falls to a WILDCARD (":param") sibling:
 *   the concrete value passes through unchanged (wildcards are
 *   locale-agnostic) and the walk descends into the wildcard page;
 * - a segment matching nothing ends translation — it and the rest pass
 *   through unchanged (best-effort; such links 404 in every locale alike).
 * Returns the SAME string when nothing changed.
 */
export function createPathTranslator(
  rows: PathPageRow[],
  defaultLocale: string,
): PathTranslator {
  const byParent = childrenIndex(rows);
  const def = defaultLocale.toLowerCase();

  return function translate(path: string, locale: string): string {
    if (locale.toLowerCase() === def) return path;
    if (!path.startsWith("/") || path.startsWith("//")) return path;

    // Split off ?query / #hash — never translated.
    let cut = path.length;
    for (let i = 0; i < path.length; i++) {
      const ch = path[i];
      if (ch === "?" || ch === "#") {
        cut = i;
        break;
      }
    }
    const pathname = path.slice(0, cut);
    const suffix = path.slice(cut);

    const raw = pathname.split("/").filter((s) => s.length > 0);
    if (raw.length === 0) return path;

    const out: string[] = [];
    let changed = false;
    let siblings: PathPageRow[] | undefined = byParent.get(ROOT_KEY);
    for (let i = 0; i < raw.length; i++) {
      const seg = safeDecode(raw[i]);
      const exact = siblings?.find((p) => p.slug === seg);
      if (exact) {
        const localized = effectiveSlug(exact, locale);
        if (localized !== exact.slug) {
          out.push(encodeURIComponent(localized));
          changed = true;
        } else {
          out.push(raw[i]);
        }
        siblings = byParent.get(exact.id);
        continue;
      }
      const wildcard = siblings?.find((p) => isParamSlug(p.slug));
      if (wildcard) {
        out.push(raw[i]); // concrete param value — locale-agnostic
        siblings = byParent.get(wildcard.id);
        continue;
      }
      // No page matches — stop translating; the rest passes through unchanged.
      for (let j = i; j < raw.length; j++) out.push(raw[j]);
      break;
    }
    if (!changed) return path;
    return "/" + out.join("/") + suffix;
  };
}

/**
 * The DEFAULT-locale path of one page: walk its parent chain, emitting default
 * slugs; a WILDCARD (":param") segment emits the request's captured value from
 * `params`. The top-level HOME_SLUG page is the root `/`. Returns null when
 * the path isn't reconstructible: a wildcard with no captured value, a
 * dangling parent, or a cycle.
 */
export function defaultPathForPage(
  rows: PathPageRow[],
  pageId: string,
  params: Record<string, string> = {},
): string | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const segments: string[] = [];
  const seen = new Set<string>();
  let cur = byId.get(pageId);
  if (!cur) return null;
  while (cur) {
    if (seen.has(cur.id)) return null; // cycle
    seen.add(cur.id);
    if (isParamSlug(cur.slug)) {
      const value = params[paramName(cur.slug)];
      if (!value) return null; // can't reconstruct the concrete URL
      segments.unshift(encodeURIComponent(value));
    } else {
      segments.unshift(encodeURIComponent(cur.slug));
    }
    if (cur.parentPageId === null) break;
    cur = byId.get(cur.parentPageId);
    if (!cur) return null; // dangling parent
  }
  if (segments.length === 1 && segments[0] === HOME_SLUG) return "/";
  return "/" + segments.join("/");
}

/**
 * The rendered page's own full pathname in EVERY given locale — what the
 * LanguageSwitcher navigates to (computed at plan time; the client can't know
 * localized slugs). Default locale → the unprefixed default path; other
 * locales → `/<code>` + the translated chain (root stays `/<code>`, no
 * trailing slash — Next 308s `/fi/`). Returns undefined when the default path
 * isn't reconstructible; callers then fall back to the client-side
 * prefix-only rewrite.
 */
export function pagePathsByLocale(
  rows: PathPageRow[],
  pageId: string,
  params: Record<string, string>,
  defaultLocale: string,
  codes: string[],
  translate: PathTranslator,
): Record<string, string> | undefined {
  const defaultPath = defaultPathForPage(rows, pageId, params);
  if (defaultPath === null) return undefined;
  const def = defaultLocale.toLowerCase();
  const out: Record<string, string> = {};
  for (const code of codes) {
    if (code.toLowerCase() === def) {
      out[code] = defaultPath;
      continue;
    }
    const translated = translate(defaultPath, code);
    // Locale codes are URL-safe by shape, but encode defensively (see the
    // switcher's encoded-prefix contract).
    out[code] =
      translated === "/"
        ? `/${encodeURIComponent(code)}`
        : `/${encodeURIComponent(code)}${translated}`;
  }
  return out;
}
