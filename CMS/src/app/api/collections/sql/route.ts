/**
 * content-collections (Phase-2): the OPERATOR raw-SELECT console endpoint.
 *
 *   POST { sql } → run ONE fenced, read-only SELECT over content_* tables.
 *     → 200 { columns, rows, truncated }   (rows capped at MAX_READ_ROWS)
 *     → 400 { error }                       (fence rejected the statement)
 *
 * This is the OPERATOR escape hatch (admin-only) — NOT exposed to the AI (which
 * only ever gets structured query tools, USER DECISION 2026-06-22). Safety is
 * the SAME Slice-0 fence used everywhere: `contentSelect` calls
 * `assertStatement(sql, "read")` BEFORE the SQL touches D1, so this route adds
 * NO new trust surface — it just lets the operator type the SELECT the structured
 * UI compiles. The fence guarantees: exactly one SELECT, content_*-scoped, no
 * built-ins/system tables, no PRAGMA/ATTACH/multi-statement. Bad SQL → 400, never
 * a 500 leak of the statement.
 *
 * REST-only (PM directive), gated to CMS Admin via `requireAdmin`.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { contentSelect, MAX_READ_ROWS } from "@/lib/content/content-db";
import { columnsOf } from "@/lib/content/result-shape";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const sql = (body as Record<string, unknown> | null)?.sql;
  if (typeof sql !== "string" || sql.trim() === "") {
    return Response.json({ error: "sql is required" }, { status: 400 });
  }

  try {
    const rows = await contentSelect<Record<string, unknown>>(sql);
    return Response.json({ columns: columnsOf(rows), rows, truncated: rows.length >= MAX_READ_ROWS });
  } catch (err) {
    // Fence rejections + D1 SQL errors are the operator's own bad query → 400.
    return Response.json({ error: (err as Error).message ?? "query failed" }, { status: 400 });
  }
}
