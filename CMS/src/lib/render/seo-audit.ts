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
 * SCOPE: links + images are collected from the raw `page.blocks` prop trees
 * (author-typed link/image props — Hero CTAs, image blocks, etc.) AND, when the
 * caller supplies a `componentSeo` index, from the MARKUP inside referenced
 * component trees (a component's own `<a href>` / `<img src alt>`, transitively
 * through nested component refs). The index is built by `buildComponentSeoIndex`
 * from resolved component rows (see the admin route) — `auditSeo` itself stays a
 * PURE input transform, no D1/React. Without the index the audit degrades to the
 * old block-props-only scan (backwards compatible).
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`.
 */

import type { Block, TreeNode } from "./plan-types.ts";
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

// ── Component-tree SEO extraction (deep scan) ────────────────────────────────

/** A single component's own links + images, plus the component names it refs. */
export interface ComponentSeo {
  /** Internal page-link hrefs found in this component's markup (normalized). */
  hrefs: string[];
  /** Images found in this component's markup (src may be "", alt trimmed). */
  images: Array<{ src: string; alt: string }>;
  /** Component names this tree references (PascalCase tag = nested component). */
  deps: string[];
}

/** The name→SEO index the deep scan consumes (built from resolved components). */
export type ComponentSeoIndex = Map<string, ComponentSeo>;

/** True if a tag is a component reference (PascalCase identifier), not an HTML tag. */
function isComponentTag(tag: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(tag);
}

/**
 * Extract the SEO-relevant surface (internal link hrefs + images + nested
 * component deps) from ONE component's parsed tree. PURE. Mirrors the block-prop
 * heuristics so the same broken-link / missing-alt logic applies: hrefs are only
 * kept when internal-page-routable; an `<img>` (or any node carrying an image-ish
 * prop) contributes an image finding, alt read from `alt`/`altText`/`imageAlt`.
 */
export function extractComponentSeo(tree: TreeNode): ComponentSeo {
  const hrefs: string[] = [];
  const images: Array<{ src: string; alt: string }> = [];
  const deps = new Set<string>();

  const walk = (node: TreeNode): void => {
    if (typeof node === "string") return;
    if (isComponentTag(node.tag)) deps.add(node.tag);

    const props = node.props as Record<string, unknown> | undefined;
    if (props) {
      for (const href of linkPathsInProps(props)) hrefs.push(href);
      const src = imageSrc(props);
      const isImgTag = node.tag.toLowerCase() === "img";
      if (src !== null || isImgTag || hasImageBlock(props)) {
        images.push({ src: src ?? "", alt: imageAlt(props) });
      }
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return { hrefs, images, deps: [...deps] };
}

/**
 * Build the deep-scan index from resolved component rows: each `tree` is the
 * JSON string stored in D1 (`ComponentRow.tree`). `kind === "jsonld"` components
 * emit no HTML (their `tree` is empty / a mangled JSON template — no visitor
 * links or images), so they're skipped. A tree that fails to parse is skipped.
 */
export function buildComponentSeoIndex(
  components: Array<{ name: string; tree: string; kind?: string | null }>,
): ComponentSeoIndex {
  const index: ComponentSeoIndex = new Map();
  for (const c of components) {
    if (c.kind === "jsonld") continue;
    let parsed: TreeNode;
    try {
      parsed = JSON.parse(c.tree) as TreeNode;
    } catch {
      continue;
    }
    index.set(c.name, extractComponentSeo(parsed));
  }
  return index;
}

/**
 * Collect a component's TRANSITIVE hrefs + images: its own markup plus every
 * component it references (cycle-safe via `seen`). Unknown deps (a built-in like
 * Section, or a missing component) contribute nothing.
 */
function resolveComponentSeo(
  name: string,
  index: ComponentSeoIndex,
  seen: Set<string>,
  out: { hrefs: string[]; images: Array<{ src: string; alt: string }> },
): void {
  if (seen.has(name)) return;
  seen.add(name);
  const seo = index.get(name);
  if (!seo) return;
  for (const h of seo.hrefs) out.hrefs.push(h);
  for (const img of seo.images) out.images.push(img);
  for (const dep of seo.deps) resolveComponentSeo(dep, index, seen, out);
}

/**
 * Run all four analyzers. `contentLocales.locales` drives the per-locale meta
 * checks and the accepted set of link targets (a `/fi/about` link is valid if
 * `/about` is a published page and `fi` is a content locale).
 *
 * `componentSeo` (optional): the deep-scan index from `buildComponentSeoIndex`.
 * When supplied, a block referencing a component ALSO contributes that
 * component's (transitive) markup links + images to the broken-link / missing-alt
 * checks. Omit it for the pure block-props-only scan.
 */
export function auditSeo(
  pages: AuditPage[],
  contentLocales: ContentLocales,
  componentSeo?: ComponentSeoIndex,
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

    // Handle one internal-link href against the published-path/wildcard sets.
    const checkHref = (href: string): void => {
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
    };
    // Flag an image with no alt (published pages only).
    const checkImage = (src: string, alt: string): void => {
      if (isPublished && alt.length === 0) {
        missingAlt.push({ pageId: page.id, slug: page.slug, src });
      }
    };

    // Collect this page's links + images from its block props AND, when a
    // deep-scan index is supplied, from any referenced component's markup.
    walkBlocks(page.blocks, (block) => {
      const props = block.props as Record<string, unknown> | undefined;

      for (const href of linkPathsInProps(props)) checkHref(href);

      const src = imageSrc(props);
      if (src !== null || hasImageBlock(props)) checkImage(src ?? "", imageAlt(props));

      // Deep scan: fold in the referenced component's (transitive) markup.
      if (componentSeo && block.component && componentSeo.has(block.component)) {
        const resolved = { hrefs: [] as string[], images: [] as Array<{ src: string; alt: string }> };
        resolveComponentSeo(block.component, componentSeo, new Set(), resolved);
        for (const href of resolved.hrefs) checkHref(href);
        for (const im of resolved.images) checkImage(im.src, im.alt);
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
