/**
 * Platform feature — dynamic/param-driven pages. PURE resolver that lets a
 * List/binding filter VALUE reference the current request's route param (from
 * a wildcard page slug, e.g. ":city-slug") or a URL query param (e.g. "?q=")
 * instead of a hardcoded literal. Mirrors the existing external-data-sources
 * `{ prop }` pattern (`lib/data-sources/bind.ts:resolveBindingParams`) — same
 * shape, same "missing → omit, never throw" grace.
 *
 * A filter clause's `value` may be:
 *   - a literal (string/number/boolean/array/null) — passed through unchanged.
 *   - `{ param: "city-slug" }` — resolved from the page's matched wildcard
 *     route params (see lib/render/slug.ts `isParamSlug`/`paramName`).
 *   - `{ query: "q" }` — resolved from the request URL's query string.
 * An unresolved param/query ref (name not present this request) resolves to
 * `undefined` — the CALLER decides what that means (query-compiler's `eq`
 * needs a value; the renderer host drops filters that resolve to undefined so
 * an absent optional param doesn't turn into a broken WHERE clause).
 *
 * PURE — no React, no D1, no Cloudflare. Node-testable (`node --test`).
 */

/** The request-scoped values a page render can expose to filter values. */
export interface RouteContext {
  /** Wildcard route params captured from the page's matched slug chain. */
  params: Record<string, string>;
  /** Query-string params from the request URL (first value per key). */
  query: Record<string, string>;
}

export const EMPTY_ROUTE_CONTEXT: RouteContext = { params: {}, query: {} };

/** True if `v` is a `{ param }` or `{ query }` reference object (not a literal). */
export function isRouteValueRef(v: unknown): v is { param: string } | { query: string } {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (typeof r.param === "string" && r.param !== "") ||
    (typeof r.query === "string" && r.query !== "");
}

/**
 * Resolve one filter/sort-adjacent VALUE against the route context. A literal
 * passes through unchanged; a ref resolves to the matching string or
 * `undefined` if absent this request.
 */
export function resolveRouteValue(value: unknown, ctx: RouteContext): unknown {
  if (!isRouteValueRef(value)) return value;
  const r = value as { param?: string; query?: string };
  if (r.param) return Object.prototype.hasOwnProperty.call(ctx.params, r.param)
    ? ctx.params[r.param]
    : undefined;
  if (r.query) return Object.prototype.hasOwnProperty.call(ctx.query, r.query)
    ? ctx.query[r.query]
    : undefined;
  return undefined;
}

/** A loose filter clause shape (matches query-compiler's `FilterClause`). */
export interface RouteFilterClause {
  field: string;
  op: string;
  value?: unknown;
}

/**
 * Resolve every filter clause's `value` against the route context, DROPPING
 * clauses whose ref didn't resolve (graceful: a missing optional param means
 * "don't filter on this", not "filter on undefined"). `is_null`/`not_null`
 * clauses (no value) pass through untouched regardless.
 */
export function resolveRouteFilters<T extends RouteFilterClause>(
  filters: T[] | undefined,
  ctx: RouteContext,
): T[] {
  if (!filters || filters.length === 0) return filters ?? [];
  const out: T[] = [];
  for (const f of filters) {
    if (!isRouteValueRef(f.value)) {
      out.push(f);
      continue;
    }
    const resolved = resolveRouteValue(f.value, ctx);
    if (resolved === undefined) continue; // graceful: drop, don't filter on undefined
    out.push({ ...f, value: resolved });
  }
  return out;
}

/**
 * True if any filter clause's `value` is a route-value ref (`{param}`/`{query}`)
 * that ACTUALLY RESOLVES this request (present, not dropped). Used to tell a
 * "this binding is keyed off the current route" filter (e.g. a `:city-slug`
 * page's hero looking up `slug eq {param:"city-slug"}`) apart from an ordinary
 * static/author-set filter — only the former should turn "zero rows matched"
 * into a not-found page instead of a silent default-prop fallback (see
 * `render-page.tsx`'s `hydrateBlockBindings`).
 */
export function hasResolvedRouteFilter<T extends RouteFilterClause>(
  filters: T[] | undefined,
  ctx: RouteContext,
): boolean {
  if (!filters || filters.length === 0) return false;
  return filters.some(
    (f) => isRouteValueRef(f.value) && resolveRouteValue(f.value, ctx) !== undefined,
  );
}

export function resolveRouteProps(
  props: Record<string, unknown> | undefined,
  ctx: RouteContext,
): Record<string, unknown> | undefined {
  if (!props) return props;
  let changed = false;
  const out: Record<string, unknown> = { ...props };
  for (const [key, value] of Object.entries(props)) {
    if (!isRouteValueRef(value)) continue;
    out[key] = resolveRouteValue(value, ctx) ?? "";
    changed = true;
  }
  return changed ? out : props;
}
