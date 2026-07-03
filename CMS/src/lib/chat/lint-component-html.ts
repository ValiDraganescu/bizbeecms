/**
 * Strict lint gate for authored component HTML — catches what the LENIENT
 * parser (parse-html.ts) silently "repairs". parseHtml never throws: it
 * auto-closes unclosed tags, drops stray closers, and pops to the nearest
 * matching ancestor on a misnested closer — so a structural mistake becomes a
 * wrong-but-valid tree that sails through the planTree render check. This
 * module re-scans the RAW string with the SAME lexical rules and reports those
 * mistakes as errors instead, plus malformed `{{slot}}` syntax and (when a
 * propsSchema is supplied) slots the schema doesn't declare — an undeclared
 * slot renders as the literal `{{name}}` on the page.
 *
 * Every message names the exact bad token, its line, and the fix (AI error
 * philosophy: self-correcting errors, accept all sane inputs). PURE — no
 * React/D1/CF — so it runs under the dep-free `node --test`.
 */

import { VOID_TAGS } from "../render/parse-html.ts";
import { SLOT_RE, declaredProps } from "../render/plan-tree.ts";
import { ICON_DYNAMIC_SLOT_RE } from "../render/icons.ts";

/** Valid slot bodies: `prop`, `t prop`, `icon "name"`, `icon prop`. */
const VALID_SLOT_INNER = [
  /^\s*(?:t\s+)?[A-Za-z_][A-Za-z0-9_]*\s*$/,
  /^\s*icon\s+["'][a-z0-9-]+["']\s*$/,
  /^\s*icon\s+[A-Za-z_][A-Za-z0-9_]*\s*$/,
];

/**
 * Lint the raw HTML string: tag balance/nesting + slot syntax. Returns error
 * messages ([] = clean). The slot↔schema cross-check is separate — see
 * `lintSlotsDeclared`.
 */
export function lintComponentHtml(html: string): string[] {
  const errors: string[] = [];
  lintTags(html, errors);
  lintSlotSyntax(html, errors);
  return errors;
}

/** 1-based line of a character index (for pinpointing errors). */
function lineOf(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

/**
 * Tag balance — mirrors parse-html's tokenizer (comments skipped, quoted
 * attribute values may contain `<`/`>`, a stray `<` not followed by a letter is
 * text) but is STRICT where the parser is lenient.
 */
function lintTags(src: string, errors: string[]): void {
  const stack: { tag: string; line: number }[] = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) break;

    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }

    if (src[lt + 1] === "/") {
      const end = src.indexOf(">", lt);
      if (end === -1) {
        errors.push(`closing tag at line ${lineOf(src, lt)} never ends — add ">"`);
        break;
      }
      const name = src.slice(lt + 2, end).trim();
      const ln = lineOf(src, lt);
      let s = stack.length - 1;
      while (s >= 0 && stack[s].tag.toLowerCase() !== name.toLowerCase()) s--;
      if (s === -1) {
        errors.push(
          `stray closing tag </${name}> (line ${ln}) — no <${name}> is open; remove it or add the opening tag`,
        );
      } else {
        for (let k = stack.length - 1; k > s; k--) {
          errors.push(
            `<${stack[k].tag}> (opened line ${stack[k].line}) is still open when </${name}> closes (line ${ln}) — add </${stack[k].tag}> before it`,
          );
        }
        stack.length = s;
      }
      i = end + 1;
      continue;
    }

    const m = /^<([A-Za-z][A-Za-z0-9_-]*)/.exec(src.slice(lt));
    if (!m) {
      i = lt + 1; // stray "<" is text, same as the parser
      continue;
    }
    const tag = m[1];
    const scan = scanToTagEnd(src, lt + m[0].length);
    if (!scan) {
      errors.push(`<${tag}> at line ${lineOf(src, lt)} never ends — add ">"`);
      break;
    }
    if (!scan.selfClosing && !VOID_TAGS.has(tag.toLowerCase())) {
      stack.push({ tag, line: lineOf(src, lt) });
    }
    i = scan.next;
  }
  for (const open of stack) {
    errors.push(`unclosed <${open.tag}> (opened line ${open.line}) — add </${open.tag}>`);
  }
}

/** Advance past a tag's attributes to its `>` / `/>`, honoring quoted values. */
function scanToTagEnd(src: string, from: number): { next: number; selfClosing: boolean } | null {
  let i = from;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end === -1) return null; // unterminated attribute value
      i = end + 1;
      continue;
    }
    if (c === ">") return { next: i + 1, selfClosing: false };
    if (c === "/" && src[i + 1] === ">") return { next: i + 2, selfClosing: true };
    i++;
  }
  return null;
}

/** Every `{{…}}` must be a valid slot form; every `{{`/`}}` must be paired. */
function lintSlotSyntax(src: string, errors: string[]): void {
  for (const m of src.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const inner = m[1];
    if (!VALID_SLOT_INNER.some((re) => re.test(inner))) {
      const shown = inner.length > 40 ? `${inner.slice(0, 40)}…` : inner;
      errors.push(
        `bad slot "{{${shown}}}" (line ${lineOf(src, m.index)}) — valid forms: {{prop}}, {{t prop}}, {{icon "name"}}, {{icon prop}}`,
      );
    }
  }
  // Blank out the paired slots, then any surviving braces are unpaired.
  const stripped = src.replace(/\{\{[\s\S]*?\}\}/g, (s) => " ".repeat(s.length));
  const open = stripped.indexOf("{{");
  if (open !== -1) {
    errors.push(`unclosed "{{" at line ${lineOf(src, open)} — every slot needs a matching "}}"`);
  }
  const close = stripped.indexOf("}}");
  if (close !== -1) {
    errors.push(`stray "}}" at line ${lineOf(src, close)} — every "}}" needs a matching "{{"`);
  }
}

/**
 * Every used slot name must be declared in the supplied propsSchema (an
 * undeclared slot renders as literal `{{name}}` on the page). Exported
 * separately: callers run it only when a call actually SUPPLIES a schema — an
 * update that omits propsSchema keeps the stored one, which a pure validator
 * can't see.
 */
export function lintSlotsDeclared(html: string, propsSchemaJson: string): string[] {
  const errors: string[] = [];
  const declared = declaredProps(propsSchemaJson);
  const used = new Set<string>();
  for (const m of html.matchAll(SLOT_RE)) used.add(m[1]);
  for (const m of html.matchAll(ICON_DYNAMIC_SLOT_RE)) used.add(m[1]); // quoted icon literals need no prop
  for (const name of used) {
    if (!declared.has(name)) {
      errors.push(
        `slot {{${name}}} is not declared in propsSchema — add "${name}": { "type": …, "default": <realistic placeholder> } or remove the slot`,
      );
    }
  }
  return errors;
}
