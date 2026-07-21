/**
 * Public guest-chat dispatch — PURE arg shaping (Slice 3).
 *
 * The dep-free half of the guest tool dispatcher (`dispatch.ts` owns the I/O):
 * turning a model's raw tool `args` into the SAFE, server-controlled shapes the
 * stores expect. These are the trust-boundary transforms — a guest's args can
 * never widen scope past what an operator allowlisted:
 *
 *  - `guestQuerySpec`: build a `queryCollection` spec from equality filters +
 *    search + limit, clamped to the guest cap and FORCING `status: "published"`
 *    and the live (non-archived) scope, regardless of what the args asked for.
 *  - `updateLookupFilters`: exact-match filters over EVERY declared lookup field
 *    (all required — a partial lookup would widen the match set).
 *  - `guestBody`: keep only declared, non-system field names from args (the
 *    schema is the allowlist), dropping anything else a guest tried to set.
 *
 * Dep-free so it runs under `node --test`; only relative `.ts` imports.
 */
import type { QuerySpec, FilterClause } from "../content/query-compiler.ts";

/** Reserved arg names the query tool exposes that are NOT collection fields. */
const QUERY_RESERVED = new Set(["search", "limit"]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Coerce a raw arg value to a filter string; non-primitives are ignored upstream. */
function argString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/**
 * Build a `queryCollection` spec for a guest query tool.
 *
 * Every declared field the args supply becomes an EQ filter; `search` becomes a
 * free-text search; `limit` is clamped to `[1, limitMax]`. `status: "published"`
 * and the live scope are FORCED — a guest can never read drafts or archived rows,
 * and cannot override the status via an args field (a field named "status" is a
 * user column here, not the system status; the forced spec.status wins in SQL).
 */
export function guestQuerySpec(
  args: unknown,
  declaredFields: string[],
  limitMax: number,
): QuerySpec {
  const rec = asRecord(args) ?? {};
  const declared = new Set(declaredFields);
  const filters: FilterClause[] = [];
  for (const [k, v] of Object.entries(rec)) {
    if (QUERY_RESERVED.has(k) || !declared.has(k)) continue;
    const s = argString(v);
    if (s !== null) filters.push({ field: k, op: "eq", value: s });
  }

  const spec: QuerySpec = {
    filters,
    status: "published", // server-forced — never from args
    archived: "live",
    limit: clamp(rec.limit, limitMax),
  };
  const search = argString(rec.search);
  if (search !== null && search.trim() !== "") spec.search = search;
  return spec;
}

/** Clamp a raw limit arg into `[1, limitMax]`; absent/garbage → limitMax. */
function clamp(raw: unknown, limitMax: number): number {
  const n = typeof raw === "number" ? Math.trunc(raw) : Number(raw);
  if (!Number.isFinite(n)) return limitMax;
  return Math.max(1, Math.min(limitMax, n));
}

/**
 * Exact-match filters over ALL declared lookup fields for an update.
 *
 * EVERY lookup field must be supplied — a partial lookup would widen the match
 * set and risk touching the wrong item. Returns the error (naming the missing
 * fields) instead so the dispatcher answers a self-correcting tool error.
 */
export function updateLookupFilters(
  args: unknown,
  lookupFields: string[],
): { ok: true; filters: FilterClause[] } | { ok: false; error: string } {
  const rec = asRecord(args) ?? {};
  const filters: FilterClause[] = [];
  const missing: string[] = [];
  for (const name of lookupFields) {
    const s = Object.prototype.hasOwnProperty.call(rec, name) ? argString(rec[name]) : null;
    if (s === null || s === "") missing.push(name);
    else filters.push({ field: name, op: "eq", value: s });
  }
  if (missing.length > 0) {
    return { ok: false, error: `missing required lookup value(s): ${missing.join(", ")}` };
  }
  return { ok: true, filters };
}

/**
 * Keep only declared field names from the args, dropping lookup fields and any
 * arg that isn't a declared collection field. The schema is the allowlist — a
 * guest can never set a system column (id/slug/status/…) this way. `exclude`
 * carries the lookup fields for updates (they identify, they don't change).
 */
export function guestBody(
  args: unknown,
  declaredFields: string[],
  exclude: string[] = [],
): Record<string, string> {
  const rec = asRecord(args) ?? {};
  const skip = new Set(exclude);
  const body: Record<string, string> = {};
  for (const name of declaredFields) {
    if (skip.has(name)) continue;
    if (!Object.prototype.hasOwnProperty.call(rec, name)) continue;
    const s = argString(rec[name]);
    if (s !== null) body[name] = s;
  }
  return body;
}
