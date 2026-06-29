/**
 * Inline component context for the AI assistant.
 *
 * Sibling channel to `page-context.ts`, for the Components → Develop workbench:
 * when the operator selects a component to work on, the workbench publishes its
 * FULL artifact ({name, tree, script, css, propsSchema}) here, and the floating
 * widget shows the model the markup as Handlebars-HTML (the tool contract), and
 * ChatWidget reads the latest value at send-time and prepends it to the user's
 * NEXT message — so the assistant knows exactly which component is being edited
 * AND has its complete code, not just the name.
 *
 * `formatComponentContext` is the PURE bit (the only logic worth testing): it
 * turns the selected component into a model-facing context block. Unlike the page
 * context (a one-liner), this embeds the whole component so the assistant can
 * reason about and modify it without a round-trip through get_component.
 */

// Relative (not @/) imports so this stays node-testable like its pure peers
// (the dep-free `node --test` convention can't resolve the @/ alias).
import { treeToHtml } from "../render/parse-html.ts";
import type { TreeNode } from "../render/tree.ts";

export interface ComponentContextInput {
  /** Stable identifier the AI uses for get_component / update_component. */
  name: string;
  /** The component markup — a TreeNode (rendered to HTML for the model) or an HTML string. */
  tree: unknown;
  /** Client JS shipped to the browser as a <script> string ("" if none). */
  script: string;
  /** Component CSS ("" if none). */
  css: string;
  /** propsSchema JSON string (the {{slot}} declarations + defaults), or null. */
  propsSchema: string | null;
}

/**
 * The inline context block prepended to the next user message. Returns "" for a
 * null selection. Embeds the full component code so the assistant has everything
 * it needs about the component currently open in the workbench.
 */
export function formatComponentContext(
  c: ComponentContextInput | null | undefined,
): string {
  if (!c) return "";
  const html = typeof c.tree === "string" ? c.tree : treeToHtml(c.tree as TreeNode);
  const propsSchema = c.propsSchema ?? "(none)";
  const script = c.script.trim() === "" ? "(none)" : c.script;
  const css = c.css.trim() === "" ? "(none)" : c.css;
  return (
    `[Component Develop context] The user is working on the component ` +
    `"${c.name}" in the Develop workbench. Use this name directly for ` +
    `component tools (get_component, update_component) — do NOT call ` +
    `list_components to find it. Apply component requests to THIS component ` +
    `unless they say otherwise. Its full current artifact:\n\n` +
    `name: ${c.name}\n\n` +
    `propsSchema:\n${propsSchema}\n\n` +
    `html:\n${html}\n\n` +
    `script:\n${script}\n\n` +
    `css:\n${css}`
  );
}

// Module-level latest value + subscribers — same pattern as page-context.
let active = "";
const listeners = new Set<() => void>();

/** Publish the current component context (or clear it with null). */
export function setActiveComponentContext(
  c: ComponentContextInput | null | undefined,
): void {
  const next = formatComponentContext(c);
  if (next === active) return;
  active = next;
  for (const fn of listeners) fn();
}

/** The latest published context block, or "" when nothing is selected. */
export function getActiveComponentContext(): string {
  return active;
}

/** Subscribe to context changes (for `useSyncExternalStore`). */
export function subscribeActiveComponentContext(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
