/**
 * content-collections — Slice 4: the structured-query endpoint.
 *
 *   GET /api/collections/[name]/query
 *     ?filter=field:op:value   (repeatable; op ∈ eq|ne|lt|lte|gt|gte|like|in|is_null|not_null)
 *                              (in → value is comma-separated; is_null/not_null take no value)
 *     ?sort=field:asc|desc     (repeatable)
 *     ?search=needle           (simple LIKE over text fields — NO FTS5 in v1)
 *     ?limit=&offset=          (paginate; limit clamped to [1,1000])
 *     ?status=draft|published  &archived=live|archived|all
 *   → { items, total, limit, offset }
 *
 * `[name]` is the `content_<slug>` table name. Gated to CMS Admin. The query is
 * compiled to a SAFE PARAMETERIZED SELECT server-side (PURE `compileQuery`); column
 * names are whitelisted against the registry, every value is bound. Unknown
 * column/op → 400.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { queryCollection } from "@/db/query-store";
import type { FilterClause, FilterOp, QuerySpec, SortClause } from "@/lib/content/query-compiler";

export const dynamic = "force-dynamic";

const NO_VALUE_OPS = new Set<FilterOp>(["is_null", "not_null"]);

/** Parse `field:op:value` (value may contain `:`). Returns null on malformed. */
function parseFilter(raw: string): FilterClause | null {
  const first = raw.indexOf(":");
  if (first === -1) return null;
  const field = raw.slice(0, first);
  const rest = raw.slice(first + 1);
  const second = rest.indexOf(":");
  const op = (second === -1 ? rest : rest.slice(0, second)) as FilterOp;
  if (!field || !op) return null;

  if (NO_VALUE_OPS.has(op)) return { field, op };
  const valueRaw = second === -1 ? "" : rest.slice(second + 1);
  if (op === "in") {
    return { field, op, value: valueRaw.split(",").map((s) => s.trim()).filter((s) => s !== "") };
  }
  return { field, op, value: valueRaw };
}

/** Parse `field:dir`. dir defaults to desc. */
function parseSort(raw: string): SortClause | null {
  const [field, dir] = raw.split(":");
  if (!field) return null;
  return { field, dir: dir === "asc" ? "asc" : "desc" };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { name } = await params;
  const sp = new URL(request.url).searchParams;

  const filters = sp.getAll("filter").map(parseFilter).filter((f): f is FilterClause => f !== null);
  const sort = sp.getAll("sort").map(parseSort).filter((s): s is SortClause => s !== null);

  const archivedRaw = sp.get("archived");
  const spec: QuerySpec = {
    filters,
    sort,
    search: sp.get("search") ?? undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    status: sp.get("status") ?? undefined,
    archived: archivedRaw === "archived" || archivedRaw === "all" ? archivedRaw : "live",
  };

  try {
    const result = await queryCollection(name, spec);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.plan);
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "failed to query collection" }, { status: 500 });
  }
}
