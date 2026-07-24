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
  /**
   * The block currently selected in the editor (a Section itself or any block
   * nested inside one). When it resolves to a section, the context names that
   * selection and the section's contents are injected into the next message —
   * so "this section" / "the selected block" requests land on the right ids.
   */
  selectedBlockId?: string | null;
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
  let out =
    `[Page Builder context] The user is editing the page "${page.path}" ` +
    `(id: "${page.id}", slug: "${page.slug}", status: ${status}). ` +
    `Use this id directly for page tools (update_page_blocks, bind_component, ` +
    `create_list, bind_list) — do NOT call list_pages or get_page to find it. ` +
    `Apply page-related requests to this page unless they say otherwise.`;
  const sel = findSelectedSection(page.sections ?? [], page.selectedBlockId);
  if (sel) {
    out +=
      sel.block.id === sel.section.id
        ? ` The user currently has the section "${sel.section.name}" (id: "${sel.section.id}") ` +
          `selected in the editor — "this section" refers to it.`
        : ` The user currently has a ${sel.block.component} block (id: "${sel.block.id}") ` +
          `selected in the editor, inside the section "${sel.section.name}" ` +
          `(id: "${sel.section.id}") — "this block" / "this section" refer to these.`;
  }
  return out;
}

/**
 * Resolve the editor's selected block id to the top-level section that contains
 * it (or IS it), plus the selected block itself. Null when nothing is selected
 * or the id isn't inside any section (e.g. stale after a delete). PURE.
 */
export function findSelectedSection(
  sections: ReadonlyArray<SectionMention>,
  selectedBlockId: string | null | undefined,
): SelectedSection | null {
  if (!selectedBlockId) return null;
  for (const s of sections) {
    const block = findInSubtree(s.block, selectedBlockId);
    if (block) return { section: s, block };
  }
  return null;
}

/** The editor's selection resolved to its enclosing section + the block itself. */
export type SelectedSection = { section: SectionMention; block: Block };

function findInSubtree(block: Block, id: string): Block | null {
  if (block.id === id) return block;
  for (const c of block.children ?? []) {
    const hit = findInSubtree(c, id);
    if (hit) return hit;
  }
  return null;
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
    if (mentionRe(s.name).test(message) && !matched.some((m) => m.id === s.id)) matched.push(s);
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

/**
 * Match `@Name` whether or not it's wrapped in backticks; word-ish boundary so
 * "@Hero" doesn't also match a section literally named "Her".
 */
function mentionRe(name: string): RegExp {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("@" + esc + "(?![\\w-])", "i");
}

/**
 * Per-message context for the editor's SELECTED section: the same contents
 * outline an @mention injects, so the assistant sees what the user is working
 * on without them having to @-name it. Returns "" when nothing is selected, and
 * defers to `formatMentionedSections` (no duplicate outline) when the message
 * @-mentions the selected section anyway.
 */
export function formatSelectedSection(message: string, sel: SelectedSection | null): string {
  if (!sel) return "";
  if (mentionRe(sel.section.name).test(message)) return "";
  const selectedLine =
    sel.block.id === sel.section.id
      ? ""
      : `The selected block within it is ${sel.block.component} (id: ${sel.block.id}).\n`;
  return (
    `[Selected section] The user has the section "${sel.section.name}" (id: ${sel.section.id}) ` +
    `selected in the editor — its current contents:\n${selectedLine}${summarizeBlock(sel.section.block)}\n` +
    `Operate on the exact block id shown — to change a select/list, target the List block's id, ` +
    `NOT the Section. If the section has no block matching the request, say so instead of guessing.`
  );
}

// Module-level latest value + subscribers. `send` reads the string fresh; the UI
// chip + the @section autocomplete subscribe so they update as the user navigates
// or edits sections. `activeSections` is the structured mirror of `active`.
let active = "";
let activeSections: SectionMention[] = [];
let activeSelectedBlockId: string | null = null;
const listeners = new Set<() => void>();

/** Publish the current page context (or clear it with null). Notifies subscribers. */
export function setActivePageContext(page: PageContextInput | null | undefined): void {
  const next = formatPageContext(page);
  const nextSections = page?.sections ?? [];
  // Always store the freshest sections (their block subtrees change on every edit;
  // send-time reads them for @mention resolution). Only NOTIFY when the
  // autocomplete-visible shape (id+name list) or the prose string actually changes
  // (selection changes land here — the prose names the selected ids), so
  // typing-in-a-section doesn't thrash subscribers.
  const shapeChanged = next !== active || !sameSections(activeSections, nextSections);
  active = next;
  activeSections = nextSections;
  activeSelectedBlockId = page?.selectedBlockId ?? null;
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

/**
 * The editor's current selection resolved against the freshest sections (for the
 * send-time [Selected section] context). Null when nothing (in a section) is selected.
 */
export function getActiveSelectedSection(): SelectedSection | null {
  return findSelectedSection(activeSections, activeSelectedBlockId);
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
