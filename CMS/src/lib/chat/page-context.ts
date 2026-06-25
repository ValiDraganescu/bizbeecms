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

export interface PageContextInput {
  /** The page's id — the assistant uses this directly for update_page_blocks etc. */
  id: string;
  /** URL-ish path, e.g. "/about" or "/blog/post". */
  path: string;
  slug: string;
  published: boolean;
}

/**
 * The inline context block prepended to the next user message. Returns "" for a
 * null selection (no page open → nothing to append). Plain text, kept short.
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

// Module-level latest value + subscribers. `send` reads it fresh; the UI chip
// subscribes so it can show/hide as the user navigates between pages.
let active = "";
const listeners = new Set<() => void>();

/** Publish the current page context (or clear it with null). Notifies subscribers. */
export function setActivePageContext(page: PageContextInput | null | undefined): void {
  const next = formatPageContext(page);
  if (next === active) return;
  active = next;
  for (const fn of listeners) fn();
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
