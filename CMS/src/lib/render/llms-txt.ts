/**
 * /llms.txt builder (seo-robots goal — AI-crawler surface, per llmstxt.org).
 *
 * llms.txt is a curated Markdown index an LLM crawler reads to understand a
 * site: an H1 with the site name, an optional blockquote summary, then link
 * lists to the site's key pages. We emit the site brand identity as the header
 * and the published-page tree as a single "Pages" section, each entry linking
 * to that page's `.md` variant (the markdown-page-variants task) with the
 * page's meta description as the optional trailing note.
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`.
 * The route (app/llms.txt/route.ts) resolves the D1 rows + origin and feeds
 * this; an unknown origin means the route emits nothing (like sitemap.ts) —
 * llms.txt links must be absolute .md URLs, and a wrong host is worse than none.
 */

export interface LlmsPageEntry {
  /** Absolute URL of the page's `.md` variant, e.g. https://x/about.md */
  mdUrl: string;
  /** Human title for the link text (resolved, non-empty). */
  title: string;
  /** Optional one-line description (meta description), already resolved. */
  description?: string;
}

export interface LlmsSiteHeader {
  /** Brand / Site name → the H1. Falls back to a generic title when blank. */
  name?: string;
  /** One-line tagline → the blockquote summary. Omitted when blank. */
  tagline?: string;
}

/** Collapse whitespace + strip newlines so a value can't break the line format. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Build the `/llms.txt` body. `entries` are already ordered by the caller
 * (sitemap order) and carry absolute `.md` URLs. Entries with a blank title or
 * URL are dropped defensively.
 */
export function buildLlmsTxt(
  header: LlmsSiteHeader,
  entries: LlmsPageEntry[],
): string {
  const name = oneLine(header.name ?? "") || "Website";
  const lines: string[] = [`# ${name}`];

  const tagline = oneLine(header.tagline ?? "");
  if (tagline) lines.push("", `> ${tagline}`);

  const clean = entries.filter((e) => oneLine(e.title) && oneLine(e.mdUrl));
  if (clean.length > 0) {
    lines.push("", "## Pages");
    for (const e of clean) {
      const title = oneLine(e.title);
      const url = oneLine(e.mdUrl);
      const desc = oneLine(e.description ?? "");
      lines.push(desc ? `- [${title}](${url}): ${desc}` : `- [${title}](${url})`);
    }
  }

  return lines.join("\n") + "\n";
}
