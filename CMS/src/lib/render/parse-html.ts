/**
 * Handlebars-HTML → TreeNode parser (component-system-html goal) — PURE module.
 *
 * Models generate components as a Handlebars-style HTML STRING instead of a JSON
 * element tree. This module turns that string into the SAME `TreeNode`
 * (`{ tag, props, children }`) the renderer already walks — so everything
 * downstream (planTree → React.createElement, slot binding, locale resolution,
 * composition-by-tag, the CSS allowlist gate, scripts) is unchanged. Nothing is
 * eval'd or compiled: we tokenize the string into data, exactly as the JSON path
 * did, just from a friendlier source format.
 *
 *   "<div class='p-4'><h2>{{t title}}</h2><p>{{body}}</p></div>"
 *     → { tag:"div", props:{ className:"p-4" }, children:[
 *          { tag:"h2", children:["{{t title}}"] },
 *          { tag:"p",  children:["{{body}}"] } ] }
 *
 * SLOTS pass through verbatim. `{{foo}}` / `{{t foo}}` stay as literal text /
 * attribute substrings; the existing `bindTree`/`bindSlots` in tree.ts replaces
 * them at render time (that's the security boundary — bound values are escaped
 * plain text, never re-parsed as HTML).
 *
 * ponytail: hand-rolled HTML SUBSET tokenizer (no DOM on Workers, no parser dep
 * for our bounded trusted-author input). Handles tags, attributes, void/
 * self-closing elements, text, and comments (dropped). Does NOT handle DOCTYPE,
 * CDATA, or raw-text elements with embedded `<` (script/style content) — scripts
 * live in the separate `script` column, not the HTML. Swap for a real parser
 * only if authors hit these limits.
 *
 * React/D1/CF-free so it is node-testable (project test convention; see CAVEATS).
 */

import type { TreeNode } from "./tree.ts";

/** Void elements: no closing tag, no children (HTML spec list). */
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Parse a Handlebars-HTML string into a TreeNode. Returns the single root
 * element. If the string has multiple top-level elements they're wrapped in a
 * `<div>`; if it's empty/whitespace, returns an empty `<div>`. NEVER throws —
 * malformed markup degrades (unclosed tags auto-close at end of input), so a bad
 * artifact surfaces via the renderer's own validation, not a parser crash.
 */
export function parseHtml(html: string): TreeNode {
  const roots = parseNodes(String(html ?? ""));
  const elements = roots.filter(
    (n) => typeof n !== "string" || n.trim() !== "",
  );
  if (elements.length === 1) return elements[0];
  if (elements.length === 0) return { tag: "div", children: [] };
  return { tag: "div", children: roots };
}

/** Parse a string into a flat list of sibling nodes (text + elements). */
function parseNodes(src: string): TreeNode[] {
  const out: TreeNode[] = [];
  // Stack of open elements; we push children onto the top of stack.
  const stack: { tag: string; props: Record<string, unknown>; children: TreeNode[] }[] = [];
  const push = (node: TreeNode) => {
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else out.push(node);
  };

  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      // Trailing text.
      pushText(push, src.slice(i));
      break;
    }
    if (lt > i) pushText(push, src.slice(i, lt));

    // HTML comment `<!-- ... -->` — drop it (don't render the body as text).
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end === -1 ? src.length : end + 3; // unterminated → swallow to end
      continue;
    }

    if (src[lt + 1] === "/") {
      // Closing tag: pop to the matching open element (lenient — pops the
      // nearest matching ancestor, auto-closing any unclosed children between).
      const end = src.indexOf(">", lt);
      if (end === -1) break; // malformed tail, stop
      const name = src.slice(lt + 2, end).trim().toLowerCase();
      closeTag(stack, out, name);
      i = end + 1;
      continue;
    }

    // Opening (or self-closing) tag.
    const parsed = parseTag(src, lt);
    if (!parsed) {
      // Not a real tag (a stray "<"): treat as text.
      pushText(push, src.slice(lt, lt + 1));
      i = lt + 1;
      continue;
    }
    const { tag, props, selfClosing, next } = parsed;
    i = next;
    if (selfClosing || VOID_TAGS.has(tag.toLowerCase())) {
      push({ tag, ...(hasKeys(props) ? { props } : {}), children: [] });
    } else {
      // Keep `props` live on the stack for attribute parsing, but only surface
      // it on the node when non-empty (matches the JSON-tree shape: no `props`
      // key for a plain `<p>`).
      const node: { tag: string; props?: Record<string, unknown>; children: TreeNode[] } = {
        tag,
        children: [],
      };
      if (hasKeys(props)) node.props = props;
      push(node);
      stack.push({ tag, props, children: node.children });
    }
  }

  // Auto-close anything left open (lenient): they're already linked to parents.
  return out;
}

/** Close the nearest open element matching `name`, popping unclosed descendants. */
function closeTag(
  stack: { tag: string; props: Record<string, unknown>; children: TreeNode[] }[],
  _out: TreeNode[],
  name: string,
): void {
  for (let s = stack.length - 1; s >= 0; s--) {
    if (stack[s].tag.toLowerCase() === name) {
      stack.length = s; // pop this element and anything still open inside it
      return;
    }
  }
  // No matching open tag — ignore the stray closer.
}

/**
 * Parse one `<tag attr="v" ...>` (or `<tag/>`) starting at `<` index `at`.
 * Returns the tag name, props (className for `class`, object for `style`),
 * whether it self-closes, and the index just past `>`. null if not a valid tag.
 */
function parseTag(
  src: string,
  at: number,
): { tag: string; props: Record<string, unknown>; selfClosing: boolean; next: number } | null {
  // Tag name.
  const nameMatch = /^<([A-Za-z][A-Za-z0-9_-]*)/.exec(src.slice(at));
  if (!nameMatch) return null;
  const tag = nameMatch[1];
  let i = at + nameMatch[0].length;
  const props: Record<string, unknown> = {};

  while (i < src.length) {
    // Skip whitespace.
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) return null; // unterminated tag
    if (src[i] === ">") return { tag, props, selfClosing: false, next: i + 1 };
    if (src[i] === "/" && src[i + 1] === ">") {
      return { tag, props, selfClosing: true, next: i + 2 };
    }

    // Attribute name.
    const am = /^([^\s=/>]+)/.exec(src.slice(i));
    if (!am) {
      i++; // can't make progress on a stray char; skip it
      continue;
    }
    const attrName = am[1];
    i += am[0].length;
    while (i < src.length && /\s/.test(src[i])) i++;

    let value: string | true = true; // boolean attribute (e.g. `disabled`)
    if (src[i] === "=") {
      i++;
      while (i < src.length && /\s/.test(src[i])) i++;
      const quote = src[i];
      if (quote === '"' || quote === "'") {
        const end = src.indexOf(quote, i + 1);
        if (end === -1) return null; // unterminated value
        value = src.slice(i + 1, end);
        i = end + 1;
      } else {
        // Unquoted value: up to whitespace or > .
        const vm = /^[^\s>]*/.exec(src.slice(i));
        value = vm ? vm[0] : "";
        i += value.length;
      }
    }
    assignProp(props, attrName, value);
  }
  return null; // ran off the end without `>`
}

/** Map an HTML attribute onto the React-style prop the plan/createElement expects. */
function assignProp(
  props: Record<string, unknown>,
  name: string,
  value: string | true,
): void {
  const lower = name.toLowerCase();
  if (lower === "class") {
    props.className = value === true ? "" : value;
    return;
  }
  if (lower === "for") {
    props.htmlFor = value === true ? "" : value;
    return;
  }
  if (lower === "style" && typeof value === "string") {
    props.style = parseStyle(value);
    return;
  }
  // Everything else passes through under its original name (data-*, aria-*,
  // href, src, alt, id, type, …). A bare boolean attribute → true.
  props[name] = value === true ? true : value;
}

/** "color:red; margin-top: 4px" → { color:"red", marginTop:"4px" }. */
function parseStyle(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) continue;
    // kebab-case → camelCase (margin-top → marginTop); leave custom props (--x) alone.
    const key = prop.startsWith("--")
      ? prop
      : prop.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out[key] = val;
  }
  return out;
}

/**
 * Push a text node, decoding the handful of HTML entities authors actually use.
 * Whitespace-only runs that contain a newline are inter-element FORMATTING
 * whitespace (indentation from a pretty-printed source) — drop them so compact
 * and formatted HTML parse to the SAME tree. A whitespace run WITHOUT a newline
 * (e.g. the space in `<b>a</b> <b>b</b>`) is meaningful and kept.
 */
function pushText(push: (n: TreeNode) => void, text: string): void {
  if (text === "") return;
  if (text.trim() === "" && text.includes("\n")) return;
  // Heal legacy data: components saved before the tokenizer skipped comments
  // baked `<!-- x -->` in as a TEXT node, which treeToHtml stored ESCAPED
  // (`&lt;!-- x --&gt;`). Strip those runs so old components stop showing comment
  // text on render, no migration. (Live comments are dropped in the tokenizer.)
  const cleaned = text.replace(/&lt;!--[\s\S]*?--&gt;/g, "");
  if (cleaned === "") return;
  if (cleaned.trim() === "" && cleaned.includes("\n")) return;
  push(decodeEntities(cleaned));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // last, so &amp;lt; → &lt;
}

function hasKeys(o: Record<string, unknown>): boolean {
  for (const _ in o) return true;
  return false;
}

// ── TreeNode → HTML (the inverse) ────────────────────────────────────────────
//
// Used at the store boundary so internal callers that still build a JSON
// `TreeNode` (the premade kits, portable import) persist HTML in the `html`
// column, and the Develop editor / export show HTML. Round-trips with parseHtml
// for the subset both support. NOT a security boundary — slots stay literal.

/** Serialize a TreeNode back to a compact Handlebars-HTML string (storage path). */
export function treeToHtml(node: TreeNode): string {
  if (typeof node === "string") return escapeText(node);
  if (node == null || typeof node !== "object" || typeof node.tag !== "string") {
    return "";
  }
  const attrs = propsToAttrs(node.props);
  const open = `<${node.tag}${attrs}`;
  if (VOID_TAGS.has(node.tag.toLowerCase())) return `${open} />`;
  const inner = (node.children ?? []).map(treeToHtml).join("");
  return `${open}>${inner}</${node.tag}>`;
}

/**
 * Pretty-print a TreeNode as indented Handlebars-HTML for the editor (one
 * element per line, 2-space indent). An element whose only child is a single
 * text/slot node stays on one line (`<h1>{{title}}</h1>`) so leaf content reads
 * naturally; elements with element children break across lines. Round-trips
 * through parseHtml exactly like the compact form (whitespace between elements
 * parses to blank text nodes, which the planner ignores).
 */
export function formatHtml(node: TreeNode, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (typeof node === "string") return node.trim() === "" ? "" : pad + escapeText(node);
  if (node == null || typeof node !== "object" || typeof node.tag !== "string") {
    return "";
  }
  const attrs = propsToAttrs(node.props);
  const open = `<${node.tag}${attrs}`;
  if (VOID_TAGS.has(node.tag.toLowerCase())) return `${pad}${open} />`;

  const kids = (node.children ?? []).filter(
    (c) => !(typeof c === "string" && c.trim() === ""),
  );
  // Empty, or a single inline (text/slot) child → keep on one line.
  if (kids.length === 0) return `${pad}${open}></${node.tag}>`;
  if (kids.length === 1 && typeof kids[0] === "string") {
    return `${pad}${open}>${escapeText(kids[0])}</${node.tag}>`;
  }
  const inner = kids.map((c) => formatHtml(c, indent + 1)).filter(Boolean).join("\n");
  return `${pad}${open}>\n${inner}\n${pad}</${node.tag}>`;
}

function propsToAttrs(props: Record<string, unknown> | undefined): string {
  if (!props) return "";
  let out = "";
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    const name = k === "className" ? "class" : k === "htmlFor" ? "for" : k;
    if (v === true) {
      out += ` ${name}`;
      continue;
    }
    if (name === "style" && typeof v === "object") {
      out += ` style="${escapeAttr(styleToCss(v as Record<string, string>))}"`;
      continue;
    }
    out += ` ${name}="${escapeAttr(String(v))}"`;
  }
  return out;
}

function styleToCss(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([k, v]) => {
      const prop = k.startsWith("--") ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      return `${prop}: ${v}`;
    })
    .join("; ");
}

// Escape text/attribute content but LEAVE `{{slot}}` markers untouched — they're
// not HTML, and bindSlots replaces them with already-escaped values at render.
function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
