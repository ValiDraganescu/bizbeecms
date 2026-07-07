/**
 * SEO audit analyzers (seo-robots goal — operator SEO tooling).
 *
 * PURE, read-only report over the page table. Given the parsed page rows and the
 * site's content locales, it produces four finding lists the admin SEO-audit view
 * renders:
 *
 *  1. orphans      — published pages no other page links to (unreachable except
 *                    via nav/sitemap; hurts internal PageRank flow).
 *  2. brokenLinks  — internal `/path` link props pointing at a path no published
 *                    page serves (a dead link → 404 for visitors + crawlers).
 *  3. missingMeta  — published page × locale missing a meta title or description.
 *  4. missingAlt   — an image prop with no alt text (accessibility + image SEO).
 *
 * SCOPE (deliberate, ponytail): links + images are collected from the raw
 * `page.blocks` prop trees (author-typed link/image props — Hero CTAs, image
 * blocks, etc.). It does NOT resolve referenced *component* trees (that needs the
 * D1-backed component resolver + next-intl and isn't a pure input) — a
 * component-tree deep scan is a filed follow-up. This already catches the common
 * author mistakes: a CTA pointing at a renamed slug, an image block with no alt.
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`.
 */

import type { Block } from "./plan-types.ts";
import { publishedPagePaths, type SitemapPageRow } from "./sitemap-paths.ts";
import { SKIP_SEGMENTS } from "./localize-links.ts";
import type { ContentLocales } from "./localize.ts";

/** A page row as the audit needs it (blocks already parsed to a Block[]). */
export interface AuditPage extends SitemapPageRow {
  blocks: Block[];
  /** Per-locale meta title map (missing/blank locale key = absent). */
  metaTitle: Record<string, string>;
  /** Per-locale meta description map. */
  metaDescription: Record<string, string>;
}

export interface OrphanFinding {
  pageId: string;
  slug: string;
  path: string;
}
export interface BrokenLinkFinding {
  /** The page whose block holds the dead link. */
  pageId: string;
  slug: string;
  /** The dead internal path (query/hash stripped). */
  href: string;
}
export interface MissingMetaFinding {
  pageId: string;
  slug: string;
  locale: string;
  /** Which fields are missing for this page × locale. */
  missing: Array<"title" | "description">;
}
export interface MissingAltFinding {
  pageId: string;
  slug: string;
  /** The image src (for the operator to locate it). "" if the src is also absent. */
  src: string;
}

export interface SeoAuditReport {
  orphans: OrphanFinding[];
  brokenLinks: BrokenLinkFinding[];
  missingMeta: MissingMetaFinding[];
  missingAlt: MissingAltFinding[];
}

/** Root-relative path for a published page from its default-locale slug segments. */
function pathFromSegments(segments: string[]): string {
  return segments.length === 0 ? "/" : "/" + segments.join("/");
}

/** Strip query + hash and a trailing slash (except root) for path comparison. */
function normalizePath(href: string): string {
  let p = href;
  const q = p.search(/[?#]/);
  if (q >= 0) p = p.slice(0, q);
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/** First path segment of an absolute path ("" for "/"), lowercased. */
function firstSegment(path: string): string {
  const rest = path.slice(1);
  const end = rest.search(/[/?#]/);
  const seg = end < 0 ? rest : rest.slice(0, end);
  return seg.trim().toLowerCase();
}

/** True for an INTERNAL, page-routable link path worth checking against pages. */
function isInternalPageLink(href: string): boolean {
  if (typeof href !== "string" || href.length === 0) return false;
  if (!href.startsWith("/") || href.startsWith("//")) return false; // relative / protocol-rel
  return !SKIP_SEGMENTS.has(firstSegment(href)); // skip /media /api /admin /preview /_next
}

/** Locale-prefixed variant of a path (`/about` under fi → `/fi/about`); root → `/fi`. */
function localePrefixedForms(path: string, localeCodes: string[]): Set<string> {
  const forms = new Set<string>([path]);
  for (const code of localeCodes) {
    const c = code.toLowerCase();
    forms.add(path === "/" ? `/${c}` : `/${c}${path}`);
  }
  return forms;
}

/**
 * Walk a Block tree, invoking `onProp` for every string prop value (with the key)
 * and `onImage` for every block that carries an image `src` prop (with its alt).
 * Image detection is by prop name: `src`, `image`, `imageUrl`, or `url` paired
 * with `alt`. Covers the common author image props; component-internal <img> tags
 * are out of scope (see module doc).
 */
function walkBlocks(
  blocks: Block[],
  visit: (block: Block) => void,
): void {
  for (const b of blocks) {
    visit(b);
    if (Array.isArray(b.children)) walkBlocks(b.children, visit);
  }
}

const IMAGE_SRC_KEYS = ["src", "image", "imageUrl", "imageSrc", "backgroundImage"];

/** Extract the image src from a block's props, if it carries one. */
function imageSrc(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;
  for (const key of IMAGE_SRC_KEYS) {
    const v = props[key];
    if (typeof v === "string" && v.length > 0 && looksLikeImage(v)) return v;
  }
  return null;
}

/** Heuristic: a media asset path or an image file URL. */
function looksLikeImage(v: string): boolean {
  if (v.startsWith("/media/")) return true;
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(v);
}

/** The alt text of a block's props (empty string if absent/blank). */
function imageAlt(props: Record<string, unknown> | undefined): string {
  if (!props) return "";
  for (const key of ["alt", "altText", "imageAlt"]) {
    const v = props[key];
    if (typeof v === "string") return v.trim();
  }
  return "";
}

/** Every internal page-link path referenced in a block's props (normalized). */
function linkPathsInProps(props: Record<string, unknown> | undefined): string[] {
  if (!props) return [];
  const out: string[] = [];
  for (const v of Object.values(props)) {
    if (typeof v === "string" && isInternalPageLink(v)) out.push(normalizePath(v));
  }
  return out;
}

/**
 * Run all four analyzers. `contentLocales.locales` drives the per-locale meta
 * checks and the accepted set of link targets (a `/fi/about` link is valid if
 * `/about` is a published page and `fi` is a content locale).
 */
export function auditSeo(
  pages: AuditPage[],
  contentLocales: ContentLocales,
): SeoAuditReport {
  const localeCodes = contentLocales.locales;

  // Published-page default-locale paths (canonical link targets).
  const published = publishedPagePaths(pages);
  const idToPath = new Map(published.map((p) => [p.id, pathFromSegments(p.segments)]));

  // The full accepted target set = every published path in every locale form.
  const validTargets = new Set<string>();
  for (const p of published) {
    const path = pathFromSegments(p.segments);
    for (const form of localePrefixedForms(path, localeCodes)) validTargets.add(form);
  }

  // Any page under a WILDCARD :param slug produces dynamic detail URLs we can't
  // enumerate — links into those subtrees are NOT flaggable as broken. We accept
  // any link whose first-non-locale segments prefix-match a wildcard page's
  // static ancestor path. Simplest safe rule: collect the static path prefixes of
  // pages that CONTAIN a param in their chain, and accept links under them.
  const wildcardPrefixes = collectWildcardPrefixes(pages);

  const orphans: OrphanFinding[] = [];
  const brokenLinks: BrokenLinkFinding[] = [];
  const missingMeta: MissingMetaFinding[] = [];
  const missingAlt: MissingAltFinding[] = [];

  // Track which published pages receive at least one inbound internal link.
  const linkedTo = new Set<string>();
  const pathToId = new Map<string, string>();
  for (const [id, path] of idToPath) {
    for (const form of localePrefixedForms(path, localeCodes)) pathToId.set(form, id);
  }

  for (const page of pages) {
    const isPublished = page.publishStatus === "published";

    // Collect this page's links + images from its block props.
    walkBlocks(page.blocks, (block) => {
      const props = block.props as Record<string, unknown> | undefined;

      for (const href of linkPathsInProps(props)) {
        const targetId = pathToId.get(href);
        if (targetId) {
          linkedTo.add(targetId);
        } else if (
          isPublished &&
          !validTargets.has(href) &&
          !underWildcardPrefix(href, wildcardPrefixes, localeCodes)
        ) {
          brokenLinks.push({ pageId: page.id, slug: page.slug, href });
        }
      }

      const src = imageSrc(props);
      if (src !== null || hasImageBlock(props)) {
        if (isPublished && imageAlt(props).length === 0) {
          missingAlt.push({ pageId: page.id, slug: page.slug, src: src ?? "" });
        }
      }
    });

    // Missing per-locale meta — published pages only (drafts aren't crawled).
    if (isPublished && !(page.noindex === 1 || page.noindex === true)) {
      // Skip wildcard pages: their meta is often bound per-URL at render.
      if (idToPath.has(page.id)) {
        for (const locale of localeCodes) {
          const missing: Array<"title" | "description"> = [];
          if (!(page.metaTitle[locale] ?? "").trim()) missing.push("title");
          if (!(page.metaDescription[locale] ?? "").trim()) missing.push("description");
          if (missing.length > 0) {
            missingMeta.push({ pageId: page.id, slug: page.slug, locale, missing });
          }
        }
      }
    }
  }

  // Orphans: published, non-home, non-wildcard pages nothing links to.
  for (const [id, path] of idToPath) {
    if (path === "/") continue; // home is reachable by definition
    if (!linkedTo.has(id)) {
      const page = pages.find((p) => p.id === id);
      if (page) orphans.push({ pageId: id, slug: page.slug, path });
    }
  }

  return { orphans, brokenLinks, missingMeta, missingAlt };
}

/** Does a block carry an image-ish prop even without a resolvable src? */
function hasImageBlock(props: Record<string, unknown> | undefined): boolean {
  if (!props) return false;
  // A prop named alt/altText implies an image intent even if src is blank.
  return "alt" in props || "altText" in props || "imageAlt" in props;
}

/**
 * Static path prefixes of any page whose slug-chain contains a `:param` wildcard.
 * Links deeper than such a prefix are dynamic detail URLs we can't enumerate, so
 * we never flag them as broken.
 */
function collectWildcardPrefixes(pages: AuditPage[]): string[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const prefixes: string[] = [];
  for (const page of pages) {
    // Build the slug chain; note the position of the first param segment.
    const chain: string[] = [];
    let cur: AuditPage | undefined = page;
    const seen = new Set<string>();
    let hasParam = false;
    while (cur) {
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      if (cur.slug.startsWith(":")) hasParam = true;
      chain.unshift(cur.slug);
      if (cur.parentPageId === null) break;
      cur = byId.get(cur.parentPageId);
    }
    if (!hasParam) continue;
    // Static prefix = segments up to (not including) the first param.
    const staticSegs: string[] = [];
    for (const seg of chain) {
      if (seg.startsWith(":")) break;
      staticSegs.push(seg);
    }
    prefixes.push(staticSegs.length === 0 ? "/" : "/" + staticSegs.join("/"));
  }
  return prefixes;
}

/** Is `href` under a wildcard static prefix (in any locale form)? */
function underWildcardPrefix(
  href: string,
  prefixes: string[],
  localeCodes: string[],
): boolean {
  for (const prefix of prefixes) {
    for (const form of localePrefixedForms(prefix, localeCodes)) {
      if (form === "/" ) {
        if (href.length > 1) return true;
      } else if (href === form || href.startsWith(form + "/")) {
        return true;
      }
    }
  }
  return false;
}
