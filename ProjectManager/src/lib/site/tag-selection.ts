/**
 * Pure tag-selection helpers for Site create (form + MCP). Alias-free so a
 * bare `node --test` can import it.
 *
 * A requested tag may be given as an id OR as a label (MCP callers usually
 * know labels). Resolution is against the managed vocabulary only — a Site
 * can never carry a tag that isn't in `tags`.
 */

export type TagRef = { id: string; label: string };

/** Coerce the raw `tagIds` body field into a de-duplicated string list. */
export function parseTagRefs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const s = String(v ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Resolve requested refs (ids or case-insensitive labels) to vocabulary ids.
 * `unknown` lists the refs that matched nothing, so callers can either reject
 * (MCP — the assistant must know it mistyped) or silently drop (UI form, where
 * the options came from the same vocabulary a moment ago).
 */
export function resolveTagRefs(
  requested: readonly string[],
  tags: readonly TagRef[],
): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const ref of requested) {
    const lower = ref.toLowerCase();
    const hit =
      tags.find((t) => t.id === ref) ??
      tags.find((t) => t.label.toLowerCase() === lower);
    if (!hit) unknown.push(ref);
    else if (!ids.includes(hit.id)) ids.push(hit.id);
  }
  return { ids, unknown };
}
