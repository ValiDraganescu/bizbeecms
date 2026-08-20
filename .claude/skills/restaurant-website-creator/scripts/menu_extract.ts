#!/usr/bin/env node
/**
 * Extract restaurant menu items from an HTML page into JSON.
 *
 * Zero-dependency TypeScript; runs directly on Node ≥23 (native type
 * stripping): `node menu_extract.ts page.html > menu.fi.json`
 * Works on full pages or WordPress wp-json `content.rendered` HTML:
 * `node menu_extract.ts --wp-json content.json > menu.fi.json`
 *
 * Heuristic, tuned for the common "menu as text blocks" layout:
 *
 *   <h2>Section</h2>
 *   NAME IN CAPS  L, G          <- caps line(s), dietary codes at the end
 *   description line(s)
 *   **15,50**                   <- price line (bold or plain), "14,50/24,00" ok
 *
 * Blocks are separated by deliberate &nbsp;-only elements; a block is an item
 * iff it contains a price-looking line. Adapt the regexes per site — this is a
 * starting point, not a universal parser (CAPS names, Finnish dietary codes,
 * European price format). Verify the output against the page yourself.
 */

import { readFileSync } from "node:fs";

const DIET_CODES = new Set([
  "L", "VL", "G", "(G)", "M", "VE", "VEG", "(L)", "(M)", "(VE)",
]);
const PRICE_RE = /^\d{1,3}[.,]\d{2}(\s*\/\s*\d{1,3}[.,]\d{2})?(\s*€)?(\s*\/\s*\w+)?$/;
const SECTION_TAGS = new Set(["h1", "h2", "h3"]);
const SKIP_TAGS = new Set(["script", "style", "noscript"]);
const BLOCK_TAGS = new Set(["div", "p", "li", "br", "tr"]);

interface MenuItem {
  section: string;
  name: string;
  diet: string[];
  description: string;
  price: string;
}

// --- Minimal HTML entity decoding (the ones that matter in menu copy) -------

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  eacute: "é", egrave: "è", auml: "ä", ouml: "ö", aring: "å",
  Auml: "Ä", Ouml: "Ö", Aring: "Å", uuml: "ü", ccedil: "ç",
  ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", euro: "€", deg: "°", frac12: "½",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return NAMED_ENTITIES[body] ?? m;
  });
}

// --- Flatten HTML to text lines; '## ' prefix marks section headings --------

function htmlToLines(html: string): string[] {
  const lines: string[] = [];
  let buf: string[] = [];
  let skip = 0;
  let heading = 0;

  const flush = () => {
    const raw = buf.join("");
    const text = raw.replace(/[\s ]+/g, " ").trim();
    buf = [];
    if (heading > 0) {
      if (text) lines.push("## " + text);
    } else if (text) {
      lines.push(text);
    } else if (raw.includes(" ")) {
      // An &nbsp;-only element (<div>&nbsp;</div>) = deliberate block
      // separator. Plain inter-tag whitespace ('\n', indent) is dropped,
      // or every div boundary would split the blocks apart.
      lines.push("");
    }
  };

  // Tokenize: comments, tags, text. Good enough for flattening — we never
  // need a DOM tree, only tag-boundary events + decoded text.
  const token = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(html)) !== null) {
    const [whole, tagName, , text] = m;
    if (text !== undefined) {
      if (skip === 0) buf.push(decodeEntities(text));
      continue;
    }
    if (tagName === undefined) continue; // comment
    const tag = tagName.toLowerCase();
    const isEnd = whole.startsWith("</");
    if (SKIP_TAGS.has(tag)) {
      skip = Math.max(0, skip + (isEnd ? -1 : 1));
    } else if (SECTION_TAGS.has(tag)) {
      flush();
      heading = Math.max(0, heading + (isEnd ? -1 : 1));
    } else if (BLOCK_TAGS.has(tag)) {
      flush();
    }
  }
  flush();
  return lines;
}

// --- Parse line blocks into menu items ---------------------------------------

/** 'HÄRKÄTARTAR ... L, G' -> ['Härkätartar ...', ['L','G']] */
function splitNameDiet(line: string): [string, string[]] {
  const words = line.split(/\s+/).map((w) => w.replace(/,+$/, ""));
  const diet: string[] = [];
  while (words.length && DIET_CODES.has(words[words.length - 1].toUpperCase())) {
    diet.unshift(words.pop()!);
  }
  return [words.join(" "), diet];
}

function isCaps(line: string): boolean {
  const letters = [...line].filter((c) => c.toLowerCase() !== c.toUpperCase());
  if (!letters.length) return false;
  const upper = letters.filter((c) => c === c.toUpperCase()).length;
  return upper / letters.length > 0.8;
}

function titleCase(s: string): string {
  // Like Python's str.title(): a letter starts a "word" after ANY non-letter,
  // so hyphenated parts ("Kuohuviini-Kevätsipuli…") capitalize too.
  return s.toLowerCase().replace(/(^|\P{L})(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

/** Group the flattened lines into (section, block-of-lines) pairs. */
function toBlocks(lines: string[]): { section: string; lines: string[] }[] {
  const blocks: { section: string; lines: string[] }[] = [];
  let section = "";
  let current: string[] = [];
  const close = () => {
    if (current.length) blocks.push({ section, lines: current });
    current = [];
  };
  for (const line of lines) {
    if (line.startsWith("## ")) {
      close();
      section = line.slice(3);
    } else if (!line) {
      close();
    } else {
      current.push(line);
    }
  }
  close();
  return blocks;
}

/** A block is a menu item iff it contains a price-looking line. */
function blockToItem({ section, lines }: { section: string; lines: string[] }): MenuItem | null {
  const priceI = lines.findIndex((l) => PRICE_RE.test(l));
  if (priceI === -1) return null; // not an item (intro text, buttons, footers)
  const nameLines: string[] = [];
  const descLines: string[] = [];
  const diet: string[] = [];
  for (const l of lines.slice(0, priceI)) {
    if (!descLines.length && isCaps(l)) {
      const [name, d] = splitNameDiet(l);
      nameLines.push(name);
      diet.push(...d);
    } else {
      descLines.push(l);
    }
  }
  if (!nameLines.length) return null;
  return {
    section,
    name: titleCase(nameLines.join(" ")),
    diet,
    description: descLines.join(" ").replace(/^[ ,]+|[ ,]+$/g, ""),
    price: lines[priceI].replace(/,/g, "."),
  };
}

function parse(lines: string[]): MenuItem[] {
  return toBlocks(lines).map(blockToItem).filter((it): it is MenuItem => it !== null);
}

// --- CLI ----------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  let html: string;
  if (args[0] === "--wp-json") {
    let payload = JSON.parse(readFileSync(args[1], "utf8"));
    if (Array.isArray(payload)) payload = payload[0];
    html = payload.content.rendered;
  } else {
    html = readFileSync(args[0], "utf8");
  }
  process.stdout.write(JSON.stringify(parse(htmlToLines(html)), null, 2) + "\n");
}

main();
