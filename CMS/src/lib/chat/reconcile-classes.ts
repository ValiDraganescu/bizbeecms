/**
 * html ↔ css class reconciliation (component-quality gate, non-blocking).
 *
 * Two mistakes ship silently styled-wrong components:
 *  1. an html class that is neither a Tailwind utility nor covered by the
 *     component `css` — it produces no styling at all (usually a typo);
 *  2. a class the component `css` defines that nothing uses — dead weight
 *     (usually a leftover from an earlier iteration).
 *
 * "Is this Tailwind?" is answered by the REAL compiler, not a heuristic: a
 * recognized candidate (variants and arbitrary values included) emits a rule
 * whose selector is the escaped class name; an unknown one emits nothing for
 * itself. We check SELECTOR CONTAINMENT, not output equality — the tw compiler
 * instance is cumulative across build() calls (candidates accumulate), so the
 * same class list can yield different full sheets over time, but the token's
 * own selector appears iff the token is recognized. Per-class compiles hit
 * tw-compile's global cache, so repeated common classes are free.
 *
 * The `script` counts as a legitimate consumer on BOTH sides: component css
 * exists precisely for nodes the client script builds at runtime (they never
 * appear in the SSR html), and a script may look up elements by class. A class
 * name mentioned anywhere in the script text is therefore never flagged. The
 * checks return WARNINGS (the write succeeds): a dynamically-composed class
 * name in a script would be a false positive, and quality nits must not brick
 * an otherwise valid artifact.
 */

import { buildCss } from "../render/tw-compile.ts";
import type { TreeNode } from "../render/tree.ts";

// Tailwind's selector escaping for a class token (matches CSS.escape for the
// characters utilities actually use: `:`, `/`, `[`, `]`, `.`, `%`, …).
const escapeClass = (t: string) => t.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);

async function isTailwindClass(token: string): Promise<boolean> {
  const css = await buildCss([token]);
  return css.includes(`.${escapeClass(token)}`);
}

/** All class tokens used in the tree's `class` attributes (slot tokens skipped). */
function collectTreeClasses(node: TreeNode, out: Set<string>): void {
  if (typeof node === "string" || node == null) return;
  const cls = node.props?.className;
  if (typeof cls === "string") {
    for (const t of cls.split(/\s+/)) {
      if (t !== "" && !t.includes("{{")) out.add(t);
    }
  }
  for (const child of node.children ?? []) collectTreeClasses(child, out);
}

/** Class names the component `css` defines selectors for (`.name` anywhere). */
function cssDefinedClasses(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) out.add(m[1]);
  return out;
}

/**
 * Reconcile the artifact's html classes with its css. Returns human/model-
 * readable WARNINGS ([] = clean); never throws — a compiler hiccup returns []
 * rather than failing the write it advises on.
 */
export async function reconcileComponentClasses(
  tree: TreeNode,
  css: string,
  script: string,
): Promise<string[]> {
  try {
    const warnings: string[] = [];
    const htmlClasses = new Set<string>();
    collectTreeClasses(tree, htmlClasses);
    const defined = cssDefinedClasses(css);

    const candidates = [...htmlClasses].filter(
      (t) => !defined.has(t) && !script.includes(t),
    );
    const known = await Promise.all(candidates.map(isTailwindClass));
    candidates.forEach((t, i) => {
      if (!known[i]) {
        warnings.push(
          `html class "${t}" produces no styling — it is not a Tailwind utility, not defined in the component css, and not referenced by the script. Fix the typo or add a css rule for it.`,
        );
      }
    });

    for (const name of defined) {
      if (!htmlClasses.has(name) && !script.includes(name)) {
        warnings.push(
          `css defines ".${name}" but nothing uses it — the class appears in neither the html nor the script. Remove the dead rule or apply the class.`,
        );
      }
    }
    return warnings;
  } catch {
    return [];
  }
}
