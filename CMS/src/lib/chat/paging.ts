/**
 * Shared paging for the list-a-resource AI tools (ai-context-engineering).
 *
 * Every unbounded lister (list_components, list_pages, list_assets,
 * list_prompts, list_data_sources) pages the same way: a small default `limit`,
 * an `offset`, a `total` count, and a self-correcting `hint` when more rows
 * exist — so the model never accidentally pulls a whole store into context but
 * always knows how to get the rest. Inherently tiny/bounded listers
 * (list_locales, list_builtin_types, search_icons — remote API, limit-capped)
 * deliberately do NOT page.
 *
 * PURE — no @/db/React/CF imports — so it runs under the dep-free `node --test`
 * convention (see CAVEATS). Paging happens in memory over the store's full row
 * list: the win is model-context tokens, not DB work.
 */

export interface PageArgs {
  limit: number;
  offset: number;
}

/** Tolerant int coercion: number or numeric string → trunc'd int, else undefined. */
function toInt(raw: unknown): number | undefined {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

/**
 * Coerce the model's `limit`/`offset` args to a sane page. Tolerates numbers,
 * numeric strings (open models emit numbers as strings), and missing/garbage
 * values (→ defaults). PURE, never throws.
 */
export function coercePageArgs(
  args: unknown,
  defaultLimit = 20,
  maxLimit = 100,
): PageArgs {
  const rec =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>)
      : {};
  const limit = toInt(rec.limit);
  const offset = toInt(rec.offset);
  return {
    limit: limit === undefined || limit <= 0 ? defaultLimit : Math.min(limit, maxLimit),
    offset: offset === undefined || offset < 0 ? 0 : offset,
  };
}

/**
 * Slice `rows` into one page and shape the standard paged tool result:
 * `{ ok: true, [key]: page, total, limit, offset, hint? }`. The `hint` is the
 * self-correcting part — it tells the model exactly how to get more (or that
 * its offset overshot). PURE.
 */
export function pagedResult<T>(
  key: string,
  rows: T[],
  page: PageArgs,
): Record<string, unknown> {
  const total = rows.length;
  const items = rows.slice(page.offset, page.offset + page.limit);
  const out: Record<string, unknown> = {
    ok: true,
    [key]: items,
    total,
    limit: page.limit,
    offset: page.offset,
  };
  if (page.offset + items.length < total) {
    out.hint = `showing ${items.length} of ${total} — more available; call again with offset=${page.offset + items.length}`;
  } else if (total > 0 && items.length === 0) {
    out.hint = `offset ${page.offset} is past the end (total ${total}) — use an offset below ${total}`;
  }
  return out;
}
