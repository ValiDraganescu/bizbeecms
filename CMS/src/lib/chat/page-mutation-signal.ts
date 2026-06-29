/**
 * When an AI tool mutates what the Page Builder is rendering (page blocks, a
 * component, brand/theme), the builder must refetch so the canvas isn't stale.
 * The ChatWidget and the builder shell are SIBLINGS in the layout (no prop path
 * between them), so we signal across them with a window CustomEvent rather than
 * threading a callback through the whole tree.
 *
 * Pure here: the tool-name predicate + the dispatch/event-name. The shell adds
 * the listener; the chat calls `signalPageMutation` when a tool succeeds.
 */

export const PAGE_MUTATION_EVENT = "cms:page-mutated";

/**
 * Tool names whose SUCCESS changes the rendered page or its dependencies, so the
 * builder should reload. Page-block writes + binding writes (they edit the draft
 * the canvas renders), component edits (a page may render them), and brand/theme
 * (global styling the preview reflects).
 */
const MUTATING_TOOLS = new Set<string>([
  "update_page_blocks",
  "set_block_props",
  "bind_component",
  "create_list",
  "bind_list",
  "create_component",
  "update_component",
  "edit_text",
  "update_brand_identity",
  "update_theme",
]);

/** Does a successful call of this tool change what the Page Builder renders? */
export function mutatesRenderedPage(toolName: string, ok: boolean): boolean {
  return ok && MUTATING_TOOLS.has(toolName);
}

/** Fire the cross-component reload signal (no-op outside the browser). */
export function signalPageMutation(toolName: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAGE_MUTATION_EVENT, { detail: { tool: toolName } }));
}
