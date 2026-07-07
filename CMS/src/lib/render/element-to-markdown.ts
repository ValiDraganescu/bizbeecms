/**
 * ElementPlan → Markdown serializer (seo-robots — AI-crawler `.md` page variants).
 *
 * The `.md` variant of a published page is a plain-Markdown rendering of the SAME
 * render plan the HTML route builds (`RenderPlan.root`, an `ElementPlan[]`), for
 * LLM crawlers per llmstxt.org — the `/llms.txt` index links each page to its
 * `<path>.md`, and this is what those links resolve to. We walk the normalized
 * element tree and emit Markdown for the semantic tags (headings, paragraphs,
 * lists, links, images, blockquotes, code, hr, tables, emphasis), skipping
 * chrome that carries no reading content (script/style/nav/svg/form controls).
 *
 * Design:
 *  - Input is the ALREADY-BUILT `ElementPlan` (locale-resolved, bindings
 *    hydrated, components SSR-walked to plain HTML tags) — so this stays PURE
 *    and dep-free (no React/D1/CF/next-intl), unit-testable under `node --test`,
 *    and never re-poisons the edge cache (it reads no request/visitor data).
 *  - It's a lossy but faithful READING view: visual-only wrappers (div/span/
 *    section) are transparent (their children flow through); only content-bearing
 *    tags produce Markdown syntax.
 *
 * NOT wired to a route yet — see the seo-robots BACKLOG/CAVEATS: the `(site)`
 * optional catch-all shadows every sibling route AND a page component can't
 * return a non-HTML Response, so serving `.md` needs a design decision beyond a
 * plain route. This module is the reusable core that decision will call.
 */
import type { ElementPlan } from "./plan-types.ts";

/** Tags whose subtree carries no reading content — dropped entirely. */
const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "nav",
  "input",
  "select",
  "option",
  "textarea",
  "button",
  "form",
  "iframe",
  "head",
]);

/** Inline emphasis wrappers → the Markdown marker that surrounds their text. */
const INLINE_WRAP: Record<string, string> = {
  strong: "**",
  b: "**",
  em: "_",
  i: "_",
  del: "~~",
  s: "~~",
  code: "`",
};

const HEADING_LEVEL: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

function prop(node: Extract<ElementPlan, { kind: "element" }>, name: string): string {
  const v = node.props?.[name];
  return typeof v === "string" ? v : "";
}

/** Collapse internal whitespace/newlines so inline text can't break a line. */
function inlineSpace(s: string): string {
  return s.replace(/\s+/g, " ");
}

/** Escape the few chars that would otherwise be Markdown syntax in plain text. */
function escapeText(s: string): string {
  return s.replace(/([\\`*_[\]<>])/g, "\\$1");
}

/**
 * Render a node's children as a single INLINE Markdown string (for headings,
 * paragraphs, list items, table cells, links). Block children encountered inline
 * are flattened to their inline form (best-effort — a reading view, not a
 * faithful DOM).
 */
function inline(children: ElementPlan[]): string {
  let out = "";
  for (const child of children) {
    if (child.kind === "text") {
      out += escapeText(child.text);
      continue;
    }
    const tag = child.tag.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;

    if (tag === "br") {
      out += " ";
      continue;
    }
    if (tag === "img") {
      out += imageMarkdown(child);
      continue;
    }
    if (tag === "a") {
      const text = inline(child.children).trim();
      const href = prop(child, "href").trim();
      if (!href) out += text;
      else out += `[${text || href}](${href})`;
      continue;
    }
    const wrap = INLINE_WRAP[tag];
    const inner = inline(child.children);
    if (wrap) {
      const trimmed = inner.trim();
      out += trimmed ? `${wrap}${trimmed}${wrap}` : "";
    } else {
      // Transparent wrapper (span/div/etc.) — flow children through.
      out += inner;
    }
  }
  return inlineSpace(out);
}

function imageMarkdown(node: Extract<ElementPlan, { kind: "element" }>): string {
  const src = prop(node, "src").trim();
  if (!src) return "";
  const alt = inlineSpace(prop(node, "alt")).trim();
  return `![${alt}](${src})`;
}

/** Render a `<ul>`/`<ol>` to Markdown list lines. `depth` drives indentation. */
function listBlock(
  node: Extract<ElementPlan, { kind: "element" }>,
  ordered: boolean,
  depth: number,
): string {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  let n = 1;
  for (const li of node.children) {
    if (li.kind !== "element" || li.tag.toLowerCase() !== "li") continue;
    const marker = ordered ? `${n}.` : "-";
    n++;
    // Split each <li> into its own inline text plus any nested lists.
    const nested: string[] = [];
    const own: ElementPlan[] = [];
    for (const c of li.children) {
      if (c.kind === "element" && (c.tag.toLowerCase() === "ul" || c.tag.toLowerCase() === "ol")) {
        nested.push(listBlock(c, c.tag.toLowerCase() === "ol", depth + 1));
      } else {
        own.push(c);
      }
    }
    const text = inline(own).trim();
    lines.push(`${indent}${marker} ${text}`.trimEnd());
    for (const sub of nested) if (sub) lines.push(sub);
  }
  return lines.join("\n");
}

function tableBlock(node: Extract<ElementPlan, { kind: "element" }>): string {
  const rows: string[][] = [];
  const collectRows = (n: ElementPlan) => {
    if (n.kind !== "element") return;
    const tag = n.tag.toLowerCase();
    if (tag === "tr") {
      const cells = n.children
        .filter(
          (c): c is Extract<ElementPlan, { kind: "element" }> =>
            c.kind === "element" &&
            (c.tag.toLowerCase() === "td" || c.tag.toLowerCase() === "th"),
        )
        .map((c) => inline(c.children).trim() || " ");
      if (cells.length) rows.push(cells);
      return;
    }
    for (const c of n.children) collectRows(c);
  };
  collectRows(node);
  if (rows.length === 0) return "";
  const cols = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => {
    const cells = [...r];
    while (cells.length < cols) cells.push(" ");
    return `| ${cells.join(" | ")} |`;
  };
  const lines = [pad(rows[0]), `| ${Array(cols).fill("---").join(" | ")} |`];
  for (const r of rows.slice(1)) lines.push(pad(r));
  return lines.join("\n");
}

/**
 * Render a list of block-level plan nodes to Markdown, joining blocks with a
 * blank line. Unknown/transparent container tags recurse into their children.
 */
function blocks(nodes: ElementPlan[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.kind === "text") {
      const t = inlineSpace(escapeText(node.text)).trim();
      if (t) out.push(t);
      continue;
    }
    const tag = node.tag.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;

    const level = HEADING_LEVEL[tag];
    if (level) {
      const text = inline(node.children).trim();
      if (text) out.push(`${"#".repeat(level)} ${text}`);
      continue;
    }
    if (tag === "p") {
      const text = inline(node.children).trim();
      if (text) out.push(text);
      continue;
    }
    if (tag === "hr") {
      out.push("---");
      continue;
    }
    if (tag === "blockquote") {
      const inner = blocks(node.children);
      if (inner.length) {
        out.push(inner.join("\n\n").split("\n").map((l) => `> ${l}`.trimEnd()).join("\n"));
      }
      continue;
    }
    if (tag === "pre") {
      // Preserve pre text verbatim (a fenced code block). Flatten text nodes.
      const code = flattenText(node);
      if (code.trim()) out.push("```\n" + code.replace(/\n$/, "") + "\n```");
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      const list = listBlock(node, tag === "ol", 0);
      if (list) out.push(list);
      continue;
    }
    if (tag === "table") {
      const table = tableBlock(node);
      if (table) out.push(table);
      continue;
    }
    if (tag === "img") {
      const md = imageMarkdown(node);
      if (md) out.push(md);
      continue;
    }
    if (tag === "a") {
      const md = inline([node]).trim();
      if (md) out.push(md);
      continue;
    }
    if (tag === "figure" || tag === "figcaption") {
      // figcaption reads as a paragraph; figure is transparent.
      if (tag === "figcaption") {
        const text = inline(node.children).trim();
        if (text) out.push(`*${text}*`);
        continue;
      }
      out.push(...blocks(node.children));
      continue;
    }
    // Transparent container (div/section/article/header/footer/main/span/…):
    // recurse into its children as blocks. Inline emphasis wrappers appearing at
    // block level flatten to a paragraph.
    if (INLINE_WRAP[tag]) {
      const text = inline([node]).trim();
      if (text) out.push(text);
      continue;
    }
    out.push(...blocks(node.children));
  }
  return out;
}

/** Concatenate all descendant text nodes verbatim (for <pre>). */
function flattenText(node: ElementPlan): string {
  if (node.kind === "text") return node.text;
  let out = "";
  for (const c of node.children) out += flattenText(c);
  return out;
}

export interface MarkdownDocMeta {
  /** Page title → the leading `# ` H1 (omitted when blank). */
  title?: string;
  /** Meta description → an italic lede under the title (omitted when blank). */
  description?: string;
}

/**
 * Serialize a page's render plan (`RenderPlan.root`) to a Markdown document.
 * An optional title/description head the document. Blocks are separated by a
 * blank line; a trailing newline terminates the file.
 */
export function planToMarkdown(
  root: ElementPlan[],
  meta: MarkdownDocMeta = {},
): string {
  const parts: string[] = [];
  const title = inlineSpace(meta.title ?? "").trim();
  if (title) parts.push(`# ${title}`);
  const description = inlineSpace(meta.description ?? "").trim();
  if (description) parts.push(`_${description}_`);
  parts.push(...blocks(root));
  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/**
 * Peel a trailing `.md` off the LAST URL segment (the markdown-variant suffix).
 * Returns the segments WITHOUT the suffix plus `isMd`. Root `/.md` (a single
 * ".md" segment) and a bare ".md" segment are NOT valid page variants — those
 * peel to an empty last segment which the slug resolver would map to home; we
 * only strip when a real slug remains. `["about.md"]` → `["about"]`, isMd;
 * `["blog","hello.md"]` → `["blog","hello"]`, isMd; `["about"]` → unchanged.
 */
export function peelMarkdownSuffix(segments: string[] | undefined): {
  isMd: boolean;
  rest: string[];
} {
  const raw = segments ?? [];
  if (raw.length === 0) return { isMd: false, rest: [] };
  const last = raw[raw.length - 1];
  if (!last.toLowerCase().endsWith(".md")) return { isMd: false, rest: raw };
  const stripped = last.slice(0, -3);
  if (stripped === "") return { isMd: false, rest: raw }; // bare ".md" — not a variant
  return { isMd: true, rest: [...raw.slice(0, -1), stripped] };
}
