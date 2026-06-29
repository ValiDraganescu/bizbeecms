/**
 * Inline page context for the AI assistant.
 *
 * The Page Builder and the floating ChatWidget are sibling components with no
 * shared React state (the widget is mounted by the admin shell, the selected
 * page lives inside the page-builder). This module is a tiny module-level channel:
 * the page-builder publishes the current selection via `setActivePageContext`,
 * and the widget reads the latest value at send-time via `getActivePageContext`.
 *
 * `formatPageContext` is the PURE bit (the only logic worth testing): it turns a
 * selected page into a short, model-facing context block that's prepended to the
 * user's NEXT message so the assistant knows which page they're looking at. When
 * the user navigates to a different page, the page-builder republishes, so the
 * next message carries the new page's context automatically.
 */

import type { Block } from "@/lib/render/tree";

export interface PageContextInput {
  /** The page's id — the assistant uses this directly for update_page_blocks etc. */
  id: string;
  /** URL-ish path, e.g. "/about" or "/blog/post". */
  path: string;
  slug: string;
  published: boolean;
  /**
   * The page's top-level sections as `{ id, name, block }`, in order. The id+name
   * resolve an `@SectionName` mention to the right block id and feed the composer's
   * autocomplete; `block` is the section's full subtree so a mention can inject the
   * section's resolved contents into context. Omitted/empty → no section list.
   */
  sections?: SectionMention[];
}

/** A page section the user can @-mention in chat (incl. its full block subtree). */
export type SectionMention = { id: string; name: string; block: Block };

/**
 * The inline context block prepended to the next user message. Returns "" for a
 * null selection (no page open → nothing to append). Plain text, kept short.
 * Section CONTENTS are injected per-message by `formatMentionedSections` only for
 * the sections the user actually @-mentions — this block just names the page.
 */
export function formatPageContext(page: PageContextInput | null | undefined): string {
  if (!page) return "";
  const status = page.published ? "published" : "draft";
  return (
    `[Page Builder context] The user is editing the page "${page.path}" ` +
    `(id: "${page.id}", slug: "${page.slug}", status: ${status}). ` +
    `Use this id directly for page tools (update_page_blocks, bind_component, ` +
    `create_list, bind_list) — do NOT call list_pages or get_page to find it. ` +
    `Apply page-related requests to this page unless they say otherwise.`
  );
}

/**
 * Summarize ONE block subtree into a compact, model-facing outline: every block's
 * id + component, nested by indentation, with the data-binding fields a List/bound
 * block carries (so the model can target the right block id without a get_page).
 * Pure + bounded; this is the payload `@section` injects.
 */
export function summarizeBlock(block: Block, depth = 0): string {
  const pad = "  ".repeat(depth);
  const parts: string[] = [`${block.component} (id: ${block.id})`];
  // Surface the binding-relevant bits so the model knows what it's editing.
  if (block.listSource) {
    const ls = block.listSource;
    parts.push(
      `[List: collection=${ls.collection ?? "?"}, presentation=${ls.presentation ?? "?"}` +
        (ls.labelExpr ? `, labelExpr=${JSON.stringify(ls.labelExpr)}` : "") +
        (ls.labelField ? `, labelField=${ls.labelField}` : "") +
        `]`,
    );
  }
  if (block.bindings && Object.keys(block.bindings).length > 0) {
    parts.push(`[bound: ${Object.keys(block.bindings).join(", ")}]`);
  }
  const head = `${pad}- ${parts.join(" ")}`;
  const kids = (block.children ?? []).map((c) => summarizeBlock(c, depth + 1));
  return [head, ...kids].join("\n");
}

/**
 * Build the per-message context for the sections the user @-mentioned. Scans the
 * message for `` `@<name>` `` (or bare `@<name>`) tokens, matches them against the
 * page's sections (case-insensitive), and returns a labeled outline of each
 * matched section's full contents — so the assistant operates on the RIGHT block
 * id (e.g. the List nested inside the section) instead of guessing. Returns "" when
 * nothing matches.
 */
export function formatMentionedSections(
  message: string,
  sections: ReadonlyArray<SectionMention>,
): string {
  if (sections.length === 0) return "";
  const matched: SectionMention[] = [];
  for (const s of sections) {
    // Match `@Name` whether or not it's wrapped in backticks; word-ish boundary
    // so "@Hero" doesn't also match a section literally named "Her".
    const esc = s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("@" + esc + "(?![\\w-])", "i");
    if (re.test(message) && !matched.some((m) => m.id === s.id)) matched.push(s);
  }
  if (matched.length === 0) return "";
  const blocks = matched
    .map(
      (s) =>
        `Section "${s.name}" (id: ${s.id}) — its current contents:\n${summarizeBlock(s.block)}`,
    )
    .join("\n\n");
  return (
    `[Mentioned sections] The user referenced these section(s) with @. ` +
    `Operate on the exact block id shown — to change a select/list, target the List block's id, ` +
    `NOT the Section. If the named section has no block matching the request, say so instead of guessing.\n\n` +
    blocks
  );
}

// Module-level latest value + subscribers. `send` reads the string fresh; the UI
// chip + the @section autocomplete subscribe so they update as the user navigates
// or edits sections. `activeSections` is the structured mirror of `active`.
let active = "";
let activeSections: SectionMention[] = [];
const listeners = new Set<() => void>();

/** Publish the current page context (or clear it with null). Notifies subscribers. */
export function setActivePageContext(page: PageContextInput | null | undefined): void {
  const next = formatPageContext(page);
  const nextSections = page?.sections ?? [];
  // Always store the freshest sections (their block subtrees change on every edit;
  // send-time reads them for @mention resolution). Only NOTIFY when the
  // autocomplete-visible shape (id+name list) or the prose string actually changes,
  // so typing-in-a-section doesn't thrash subscribers.
  const shapeChanged = next !== active || !sameSections(activeSections, nextSections);
  active = next;
  activeSections = nextSections;
  if (shapeChanged) for (const fn of listeners) fn();
}

/** Equality on the autocomplete-visible shape (id + name), ignoring block contents. */
function sameSections(a: SectionMention[], b: SectionMention[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.id === b[i].id && s.name === b[i].name);
}

/** The active page's sections (for the @section autocomplete). Empty when none. */
export function getActiveSections(): SectionMention[] {
  return activeSections;
}

/** The latest published context block, or "" when nothing is selected. */
export function getActivePageContext(): string {
  return active;
}

/** Subscribe to context changes (for `useSyncExternalStore`). Returns an unsubscribe. */
export function subscribeActivePageContext(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
