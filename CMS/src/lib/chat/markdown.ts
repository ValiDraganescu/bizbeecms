/**
 * A tiny, dependency-free Markdown parser for AI-assistant chat messages.
 *
 * The assistant streams Markdown (headings, **bold**, lists, `code`, fenced
 * blocks, links). We render the common subset rather than pull in react-markdown
 * + remark/rehype — that's a large dependency and arbitrary-HTML/XSS surface on
 * Workers, when the model only ever emits a handful of constructs.
 *
 * PURE: parses a string into a block tree of plain data (no React/DOM imports) so
 * it's node-testable. The component walks the tree and renders safe React
 * elements — never dangerouslySetInnerHTML, so there's no HTML-injection path.
 *
 * ponytail: covers headings, paragraphs, fenced + inline code, unordered/ordered
 * lists, blockquotes, bold/italic, and links. Skipped: tables, images, nested
 * lists, reference links — add when an assistant message actually needs one.
 */

/** Inline span: plain text, emphasis, code, or a link. */
export type Inline =
  | { type: "text"; value: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Inline[] };

/** One list item: its inline content plus an optional nested sub-list. */
export type ListItem = { children: Inline[]; sublist?: ListBlock };
export type ListBlock = { type: "list"; ordered: boolean; items: ListItem[] };

/** Block node: the top-level structure of a message. */
export type Block =
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "code"; value: string; lang?: string }
  | ListBlock
  | { type: "blockquote"; children: Inline[] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

// ── Inline parsing ───────────────────────────────────────────────────────────

/**
 * Parse inline Markdown into spans. Handles `code` (highest precedence — its
 * contents are literal), **bold**, *italic* / _italic_, and [text](href). Anything
 * unmatched is literal text. Single pass, left to right.
 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf !== "") {
      out.push({ type: "text", value: buf });
      buf = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);

    // inline code — literal until the closing backtick
    if (rest[0] === "`") {
      const end = rest.indexOf("`", 1);
      if (end > 0) {
        flush();
        out.push({ type: "code", value: rest.slice(1, end) });
        i += end + 1;
        continue;
      }
    }

    // link [text](href)
    if (rest[0] === "[") {
      const m = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
      if (m) {
        flush();
        out.push({ type: "link", href: m[2], children: parseInline(m[1]) });
        i += m[0].length;
        continue;
      }
    }

    // bold **..** or __..__
    if (rest.startsWith("**") || rest.startsWith("__")) {
      const marker = rest.slice(0, 2);
      const end = text.indexOf(marker, i + 2);
      if (end > i + 1) {
        flush();
        out.push({ type: "bold", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // italic *..* or _.._  (single marker; require non-space just inside)
    if ((rest[0] === "*" || rest[0] === "_") && rest[1] !== undefined && rest[1] !== rest[0]) {
      const marker = rest[0];
      const end = text.indexOf(marker, i + 1);
      if (end > i + 1 && text[end - 1] !== " ") {
        flush();
        out.push({ type: "italic", children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    buf += text[i];
    i++;
  }
  flush();
  return out;
}

// ── Block parsing ────────────────────────────────────────────────────────────

const HEADING = /^(#{1,6})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^```(.*)$/;
// List items, indent-aware: capture leading spaces (depth) + the content. A tab
// counts as two spaces. Bullets -,*,+ for unordered; `N.`/`N)` for ordered.
const UL_ITEM = /^([ \t]*)[-*+]\s+(.*)$/;
const OL_ITEM = /^([ \t]*)\d+[.)]\s+(.*)$/;
/** A table row line: contains at least one interior pipe, e.g. `| a | b |`. */
const TABLE_ROW = /\|/;
/**
 * Is `line` a table delimiter row (`| --- | :--: |`)? Checked imperatively rather
 * than with a regex: a `(...)+` of `-`/`:`/space classes risks catastrophic
 * backtracking on a near-miss line. A delimiter cell is only `-`, `:`, spaces,
 * and there must be at least one `-` and one cell.
 */
function isTableDelim(line: string): boolean {
  const t = line.trim();
  if (t === "" || !t.includes("-")) return false;
  if (!/^[-:|\s]+$/.test(t)) return false; // only delimiter chars
  const cells = splitRow(t);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/** Indent width in spaces (tab = 2), used to nest one list inside another. */
function indentOf(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (ch === " ") n++;
    else if (ch === "\t") n += 2;
    else break;
  }
  return n;
}

/** Split a table row `| a | b |` into trimmed cell strings. */
function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

const isListLine = (s: string) => UL_ITEM.test(s) || OL_ITEM.test(s);

/**
 * Parse a run of list lines starting at `start`, all at indent >= `minIndent`,
 * into a ListBlock. Items more indented than the current item start a nested
 * sub-list (recursion). Returns the block and the index after the run.
 */
function parseList(lines: string[], start: number, minIndent: number): { block: ListBlock; next: number } {
  const first = (OL_ITEM.exec(lines[start]) ?? UL_ITEM.exec(lines[start]))!;
  const baseIndent = indentOf(first[1]);
  const ordered = OL_ITEM.test(lines[start]);
  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length && isListLine(lines[i])) {
    const m = (OL_ITEM.exec(lines[i]) ?? UL_ITEM.exec(lines[i]))!;
    const indent = indentOf(m[1]);
    if (indent < minIndent || indent < baseIndent) break; // belongs to an outer list
    if (indent > baseIndent) break; // shouldn't happen (handled as sublist below)

    const item: ListItem = { children: parseInline(m[2]) };
    i++;
    // A more-indented run immediately after is this item's nested sub-list.
    if (i < lines.length && isListLine(lines[i]) && indentOf((OL_ITEM.exec(lines[i]) ?? UL_ITEM.exec(lines[i]))![1]) > baseIndent) {
      const sub = parseList(lines, i, baseIndent + 1);
      item.sublist = sub.block;
      i = sub.next;
    }
    items.push(item);
  }
  return { block: { type: "list", ordered, items }, next: i };
}

/** Parse a Markdown string into a block tree. */
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // blank line → block separator
    if (line.trim() === "") {
      i++;
      continue;
    }

    // fenced code block
    const fence = FENCE.exec(line);
    if (fence) {
      const lang = fence[1].trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (or EOF)
      blocks.push({ type: "code", value: body.join("\n"), ...(lang ? { lang } : {}) });
      continue;
    }

    // heading
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, children: parseInline(heading[2]) });
      i++;
      continue;
    }

    // table: a `| .. |` row followed by a `| --- |` delimiter row
    if (TABLE_ROW.test(line) && i + 1 < lines.length && isTableDelim(lines[i + 1])) {
      const header = splitRow(line).map(parseInline);
      i += 2; // header + delimiter
      const rows: Inline[][][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i]) && !isTableDelim(lines[i])) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // list (with nested sub-lists by indentation)
    if (isListLine(line)) {
      const { block, next } = parseList(lines, i, 0);
      blocks.push(block);
      i = next;
      continue;
    }

    // blockquote (consecutive > lines, joined)
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(QUOTE.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ type: "blockquote", children: parseInline(quoted.join(" ")) });
      continue;
    }

    // paragraph (consecutive non-blank, non-special lines, soft-joined)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING.test(lines[i]) &&
      !isListLine(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !FENCE.test(lines[i]) &&
      // only stop for a table that actually STARTS here (row + a delimiter next),
      // not for any prose line that merely contains a pipe.
      !(TABLE_ROW.test(lines[i]) && i + 1 < lines.length && isTableDelim(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", children: parseInline(para.join("\n")) });
  }

  return blocks;
}
