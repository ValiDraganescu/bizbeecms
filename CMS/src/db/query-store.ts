/**
 * content-collections — Slice 4: the structured-query store (live I/O).
 *
 * Thin layer over the PURE compiler (`lib/content/query-compiler.ts`). Loads the
 * collection's registry schema (`getCollection`), compiles the structured query
 * spec to a PARAMETERIZED SELECT (+ a matching COUNT), and runs both through
 * `contentSelect` (the Slice-0 fence). Returns the same `PlanResult<T>` shape as
 * Slices 2/3 so the route maps `!ok` → HTTP status uniformly. Live D1 = HITL; the
 * compiler is node-tested.
 */
import { contentSelect } from "../lib/content/content-db.ts";
import { getCollection } from "./collection-store.ts";
import {
  compileQuery,
  compileCount,
  type QuerySpec,
  type PlanResult,
} from "../lib/content/query-compiler.ts";

export type QueryRow = Record<string, unknown>;

export interface QueryResult {
  items: QueryRow[];
  total: number;
  limit: number;
  offset: number;
}

/** Run a structured query against a collection. Returns the page + total count. */
export async function queryCollection(
  tableName: string,
  spec: QuerySpec,
): Promise<PlanResult<QueryResult>> {
  const view = await getCollection(tableName);
  if (!view) return { ok: false, status: 404, error: "collection not found" };

  const q = compileQuery(tableName, view.fields, spec);
  if (!q.ok) return q;
  const c = compileCount(tableName, view.fields, spec);
  if (!c.ok) return c;

  const items = await contentSelect<QueryRow>(q.plan.sql, q.plan.params);
  const countRows = await contentSelect<{ n: number }>(c.plan.sql, c.plan.params);
  const total = Number(countRows[0]?.n ?? items.length);

  return {
    ok: true,
    plan: {
      items,
      total,
      limit: spec.limit ?? 1000,
      offset: spec.offset ?? 0,
    },
  };
}
