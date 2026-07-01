/**
 * Inline collection context for the AI assistant.
 *
 * Sibling channel to `page-context.ts` / `component-context.ts`, for the
 * Collections admin: the collections index publishes the LIST of collections, and
 * a per-collection page publishes the OPEN collection's schema (name + fields).
 * ChatWidget reads the latest value at send-time and prepends it to the user's
 * NEXT message — so the assistant knows what collections exist / which one is open
 * and can use its table name directly without a list_collections round-trip.
 *
 * `formatCollectionContext` is the PURE bit (the only logic worth testing).
 */

// Relative (not @/) imports so this stays node-testable like its pure peers.
import type { CollectionField } from "../content/collection-schema.ts";

export interface CollectionSummary {
  /** Display name, e.g. "Restaurants". */
  name: string;
  /** The `content_<slug>` table name the tools address, e.g. "content_restaurants". */
  tableName: string;
}

export interface CollectionContextInput {
  /** Every collection in the site (names + table names) — for cross-collection asks. */
  collections: CollectionSummary[];
  /** The collection currently OPEN (index page → null), including its fields. */
  current: (CollectionSummary & { fields: CollectionField[] }) | null;
}

/** One field as a compact `name: type[!]` line (`!` = required). */
function fieldLine(f: CollectionField): string {
  return `  - ${f.name}: ${f.type}${f.required ? " (required)" : ""}`;
}

/**
 * The inline context block prepended to the next user message. Returns "" when
 * there are no collections and none is open (nothing worth telling the model).
 */
export function formatCollectionContext(
  c: CollectionContextInput | null | undefined,
): string {
  if (!c) return "";
  const list = c.collections
    .map((x) => `- "${x.name}" (table: ${x.tableName})`)
    .join("\n");
  const known =
    c.collections.length > 0
      ? `Collections in this site:\n${list}`
      : "This site has no collections yet.";

  const open = c.current
    ? `\n\nThe user is viewing the "${c.current.name}" collection ` +
      `(table: ${c.current.tableName}). Its fields:\n` +
      (c.current.fields.length > 0
        ? c.current.fields.map(fieldLine).join("\n")
        : "  (no user fields yet)") +
      `\nApply collection requests to THIS collection unless they say otherwise. ` +
      `Use its table name directly for collection tools (add_collection_item, ` +
      `update_collection_item, query_collection, add/drop/rename field) — do NOT ` +
      `call list_collections to find it.`
    : "";

  if (known === "This site has no collections yet." && !open) return "";
  return `[Collections context] ${known}${open}`;
}

// Module-level latest value + subscribers — same pattern as page/component context.
let active = "";
const listeners = new Set<() => void>();

/** Publish the current collection context (or clear it with null). */
export function setActiveCollectionContext(
  c: CollectionContextInput | null | undefined,
): void {
  const next = formatCollectionContext(c);
  if (next === active) return;
  active = next;
  for (const fn of listeners) fn();
}

/** The latest published context block, or "" when nothing is set. */
export function getActiveCollectionContext(): string {
  return active;
}

/** Subscribe to context changes (for `useSyncExternalStore`). */
export function subscribeActiveCollectionContext(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
