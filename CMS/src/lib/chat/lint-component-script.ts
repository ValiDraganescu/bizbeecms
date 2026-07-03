/**
 * Script ↔ markup lint: a component script must only touch DOM the component
 * itself renders (html) or builds at runtime (script). Scripts run as GLOBAL
 * <script> elements (client-scripts.tsx) — document.querySelector sees the
 * whole page — so a selector reaching into ANOTHER component's markup works in
 * one page composition and silently breaks in the next. The same finding also
 * covers dead code: a selector matching nothing is either foreign or leftover.
 *
 * CAREFUL BY CONSTRUCTION — no guessing:
 *  - Only STATIC selector arguments are checked: plain string literals passed
 *    to querySelector(All)/closest/matches/getElementById/getElementsByClassName.
 *    A template literal with `${…}` or a concatenated expression is SKIPPED —
 *    we cannot know it, so we never flag it.
 *  - The script's OWN string literals count as markup it may build (innerHTML
 *    templates, classList.add("x"), setAttribute("data-x", …)), and
 *    `dataset.fooBar` counts as creating `data-foo-bar`.
 *  - From a selector we check only class names, #ids, [attribute names] and
 *    the foreign roots body/html/head. Tag parts, pseudos, combinators and
 *    attribute VALUES are ignored (too ambiguous to judge).
 *
 * Full unused-JS detection (dead functions/variables) needs an AST — out of
 * scope for this string-level gate. PURE — node-testable.
 */

import type { TreeNode } from "../render/tree.ts";

/** Selector-taking call: capture the method and its FIRST string-literal arg. */
const SELECTOR_CALL_RE =
  /\.(querySelector|querySelectorAll|closest|matches|getElementById|getElementsByClassName)\(\s*(['"`])((?:(?!\2)[^\\]|\\.)*)\2/g;

/** Every string/template literal in the script (to know what the script builds). */
const STRING_LITERAL_RE = /(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g;

/** `el.dataset.fooBar` creates/reads data-foo-bar. */
const DATASET_RE = /\.dataset\.([A-Za-z_$][\w$]*)/g;

const FOREIGN_ROOTS = new Set(["body", "html", "head"]);

/** Names (tags, ids, class tokens, attribute names) the component's html renders. */
function collectMarkupNames(node: TreeNode, out: Set<string>): void {
  if (typeof node === "string" || node == null) return;
  out.add(node.tag.toLowerCase());
  for (const [key, value] of Object.entries(node.props ?? {})) {
    out.add(key === "className" ? "class" : key === "htmlFor" ? "for" : key.toLowerCase());
    if (key === "className" && typeof value === "string") {
      for (const t of value.split(/\s+/)) if (t) out.add(t);
    }
    if (key === "id" && typeof value === "string" && value) out.add(`#${value}`);
  }
  for (const child of node.children ?? []) collectMarkupNames(child, out);
}

const camelToData = (name: string) =>
  `data-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

type SelectorRef = { method: string; selector: string; parts: Part[] };
type Part = { kind: "class" | "id" | "attr" | "foreign-root"; name: string };

/** Break a static selector into the parts we can judge. */
function selectorParts(method: string, selector: string): Part[] {
  if (method === "getElementById") {
    return [{ kind: "id", name: selector.trim() }];
  }
  if (method === "getElementsByClassName") {
    return selector
      .split(/\s+/)
      .filter(Boolean)
      .map((name) => ({ kind: "class", name }) as Part);
  }
  const parts: Part[] = [];
  for (const m of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) parts.push({ kind: "class", name: m[1] });
  for (const m of selector.matchAll(/#([A-Za-z_][\w-]*)/g)) parts.push({ kind: "id", name: m[1] });
  for (const m of selector.matchAll(/\[\s*([A-Za-z_][\w-]*)/g)) parts.push({ kind: "attr", name: m[1] });
  // Bare tag tokens: only the roots that are BY DEFINITION outside the component.
  for (const m of selector.matchAll(/(?:^|[\s>+~,])([a-zA-Z]+)/g)) {
    if (FOREIGN_ROOTS.has(m[1].toLowerCase())) parts.push({ kind: "foreign-root", name: m[1] });
  }
  return parts;
}

/**
 * Lint the script against the component's own markup. Returns findings
 * ([] = clean); the caller decides whether they block (authoring paths) or
 * ride as warnings.
 */
export function lintComponentScript(tree: TreeNode, script: string): string[] {
  if (!script.trim()) return [];
  const findings: string[] = [];

  const rendered = new Set<string>();
  collectMarkupNames(tree, rendered);

  // What the script itself may build: every OTHER string literal + dataset use.
  const refs: SelectorRef[] = [];
  const selectorSpans: Array<[number, number]> = [];
  for (const m of script.matchAll(SELECTOR_CALL_RE)) {
    const [, method, , literal] = m;
    if (literal.includes("${")) continue; // dynamic — cannot know, never flag
    refs.push({ method, selector: literal, parts: selectorParts(method, literal) });
    selectorSpans.push([m.index, m.index + m[0].length]);
  }
  const builds = new Set<string>();
  for (const m of script.matchAll(STRING_LITERAL_RE)) {
    const inSelector = selectorSpans.some(([s, e]) => m.index >= s && m.index < e);
    if (!inSelector) builds.add(m[2]);
  }
  for (const m of script.matchAll(DATASET_RE)) builds.add(camelToData(m[1]));
  const scriptBuilds = (name: string): boolean => {
    for (const s of builds) if (s.includes(name)) return true;
    return false;
  };

  for (const ref of refs) {
    for (const part of ref.parts) {
      if (part.kind === "foreign-root") {
        findings.push(
          `script queries "${ref.selector}" — <${part.name}> is outside this component. A component script must only touch its own markup (pages compose components freely); hook onto this component's own data-* root instead.`,
        );
        continue;
      }
      const name = part.kind === "id" ? `#${part.name.replace(/^#/, "")}` : part.name;
      const bare = part.name.replace(/^#/, "");
      const known =
        rendered.has(name) || rendered.has(bare) || rendered.has(bare.toLowerCase()) || scriptBuilds(bare);
      if (!known) {
        const what = part.kind === "class" ? `class "${bare}"` : part.kind === "id" ? `id "${bare}"` : `attribute "${bare}"`;
        findings.push(
          `script selector "${ref.selector}" uses ${what}, which this component neither renders nor builds — if it targets another component's markup, scope it to this component's own data-* hooks instead; if it's leftover, remove the dead query.`,
        );
      }
    }
  }
  return findings;
}
