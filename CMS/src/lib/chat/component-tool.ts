/**
 * The first AI tool: create/update a component (Milestone 2, epic B2).
 *
 * The AI assistant authors a custom UI component by emitting the artifact
 * `{ name, tree, script, css }` (see GOAL.md M2 / the `component` table, A1).
 * This module owns the two PURE, offline-testable concerns of that tool:
 *
 *  1. `CREATE_COMPONENT_TOOL` — the OpenAI-style function/tool schema we hand to
 *     `env.AI.run({ tools })` so the model knows how to call it.
 *  2. `validateComponentArtifact` — the security/correctness gate. The model's
 *     output is UNTRUSTED structure: we re-validate the `tree` shape (via the
 *     same pure `planTree` the renderer uses — if it can't be planned it can't
 *     render), and we validate every `className` against the BOUNDED utility
 *     vocabulary (`allowedClasses()`), since arbitrary Tailwind has no CSS at
 *     runtime (the A3 scanner gap). A bad artifact is rejected with messages the
 *     route feeds back to the model, never written to D1.
 *
 * The actual D1 write lives in `db/component-store.ts` (needs the binding); the
 * agentic call loop lives in the route. Both are build-verified only (the live
 * model call can't run offline — see HITL). This module is PURE (no React/D1/CF
 * imports) so it's unit-tested with the project's dep-free `node --test`.
 *
 * NOTE ON `script`: it is AI-authored TRUSTED client JS (the GOAL security
 * boundary is "never interpolate END-USER data into script", not "never run
 * AI script") — so we do NOT try to parse/sandbox it here. We only bound its
 * size to avoid a runaway artifact. The browser executes it, never the server.
 */

// Relative (not @/) imports so this stays node-testable like its pure peers
// (the dep-free `node --test` convention can't resolve the @/ alias; see CAVEATS).
import { planTree, type TreeNode } from "../render/tree.ts";
import { allowedClasses } from "../render/utility-css.ts";

/** The validated, ready-to-persist component artifact. */
export interface ComponentArtifactInput {
  name: string;
  tree: TreeNode;
  script: string;
  css: string;
}

// Bound the script so a confused model can't emit a multi-MB blob into D1.
const MAX_SCRIPT_BYTES = 64 * 1024;
// A component name the page block tree references — keep it a safe identifier.
const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/**
 * The tool schema handed to the model. OpenAI/Workers-AI function-calling shape.
 * `tree` is described as a JSON element tree; the model returns it as a string
 * (most open models emit JSON-as-string in tool args) OR a nested object — the
 * validator accepts both (see `coerceTree`).
 */
export const CREATE_COMPONENT_TOOL = {
  type: "function" as const,
  function: {
    name: "create_component",
    description:
      "Create or update a reusable UI component for this site. The component is " +
      "stored as a data artifact: a JSON element 'tree' the server renders to " +
      "HTML, an optional client-side 'script' string the browser runs, and " +
      "'css' utility classes. Use only the allowed utility classes for styling.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "PascalCase component name the page references, e.g. 'PricingCard'. " +
            "Re-using an existing name updates that component.",
        },
        tree: {
          type: "object",
          description:
            "JSON element tree: { tag, props, children }. props.className uses " +
            "only allowed utility classes; children is an array of trees or strings.",
        },
        script: {
          type: "string",
          description:
            "Optional client-side JavaScript run in the browser. Empty for a " +
            "static component. Never embed end-user data here.",
        },
        css: {
          type: "string",
          description:
            "Optional space-separated extra utility classes applied to the root.",
        },
      },
      required: ["name", "tree"],
    },
  },
};

/**
 * Validate a raw tool-call argument object into a persistable artifact, or
 * return the list of problems (which the route relays back to the model so it
 * can retry). PURE — never throws, never writes.
 */
export function validateComponentArtifact(
  args: unknown,
): { ok: true; artifact: ComponentArtifactInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (typeof args !== "object" || args === null) {
    return { ok: false, errors: ["tool arguments must be a JSON object"] };
  }
  const a = args as Record<string, unknown>;

  // ── name ──
  const name = typeof a.name === "string" ? a.name.trim() : "";
  if (!NAME_RE.test(name)) {
    errors.push(
      "name must match /^[A-Za-z][A-Za-z0-9_-]{0,63}$/ (a PascalCase-ish identifier)",
    );
  }

  // ── tree ── (accept object or JSON string)
  const tree = coerceTree(a.tree);
  if (tree === undefined) {
    errors.push("tree must be an element-tree object (or a JSON string of one)");
  } else {
    // Reuse the renderer's own walker: if it can't be planned, it can't render.
    try {
      planTree(tree);
    } catch (err) {
      errors.push(`tree is not renderable: ${(err as Error).message}`);
    }
    // Bound the allowed styling vocabulary. List the full accepted set in the
    // error so the model can self-correct (the prompt no longer carries it).
    const bad = collectBadClasses(tree);
    if (bad.length > 0) {
      errors.push(
        `unknown className utility classes: ${bad.join(", ")}. ` +
          `Use ONLY these (for one-off values use inline style instead): ${allowedClassList()}.`,
      );
    }
  }

  // ── script ── (optional, bounded)
  const script = typeof a.script === "string" ? a.script : "";
  if (byteLength(script) > MAX_SCRIPT_BYTES) {
    errors.push(`script exceeds ${MAX_SCRIPT_BYTES} bytes`);
  }

  // ── css ── (optional extra root classes, must also be allowed)
  const css = typeof a.css === "string" ? a.css.trim() : "";
  const badCss = css
    .split(/\s+/)
    .filter((c) => c !== "" && !allowedClasses().has(c));
  if (badCss.length > 0) {
    errors.push(
      `unknown css classes: ${badCss.join(", ")}. Use ONLY these: ${allowedClassList()}.`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, artifact: { name, tree: tree as TreeNode, script, css } };
}

/** Accept a tree object, or a JSON string of one; undefined if neither. */
function coerceTree(raw: unknown): TreeNode | undefined {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as TreeNode;
    } catch {
      return undefined;
    }
  }
  if (typeof raw === "object" && raw !== null) return raw as TreeNode;
  return undefined;
}

/**
 * Walk a tree collecting every `className` token that isn't in the allowed
 * utility vocabulary. (Class names live in `props.className`, space-separated.)
 */
/** The full accepted utility-class vocabulary, sorted, comma-joined (for errors). */
function allowedClassList(): string {
  return [...allowedClasses()].sort().join(", ");
}

function collectBadClasses(node: TreeNode): string[] {
  const allowed = allowedClasses();
  const bad = new Set<string>();
  walk(node);
  return [...bad];

  function walk(n: TreeNode): void {
    if (typeof n !== "object" || n === null) return;
    const cn = n.props?.className;
    if (typeof cn === "string") {
      for (const c of cn.split(/\s+/)) {
        if (c !== "" && !allowed.has(c)) bad.add(c);
      }
    }
    for (const child of n.children ?? []) walk(child);
  }
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
