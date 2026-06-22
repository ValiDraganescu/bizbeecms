/**
 * content-collections — Slice 3: single collection-item endpoint.
 *
 *   GET                              → fetch one item by id
 *   PATCH { ...changes }             → update (PATCH semantics: supplied keys only)
 *   PATCH { _op: "archive"|"unarchive" } → soft archive / un-archive
 *   DELETE                           → hard-delete the item
 *
 * `[name]` = the `content_<slug>` table name; `[id]` = the item's system id.
 * Gated to CMS Admin. All writes are STRUCTURED + parameterized via the fence.
 *
 * Archive is exposed on PATCH (not a separate verb) via the `_op` control key so
 * one endpoint covers the item lifecycle; `_op` is stripped before field updates.
 */
import { requireAdmin } from "@/lib/auth/guard";
import {
  getItem,
  updateItem,
  archiveItem,
  unarchiveItem,
  deleteItem,
} from "@/db/item-store";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { name, id } = await params;
  try {
    const result = await getItem(name, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.plan);
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "failed to load item" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string; id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { name, id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const obj = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  try {
    const op = obj._op;
    let result;
    if (op === "archive") {
      result = await archiveItem(name, id);
    } else if (op === "unarchive") {
      result = await unarchiveItem(name, id);
    } else {
      const { _op, ...changes } = obj;
      void _op;
      result = await updateItem(name, id, changes);
    }
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.plan);
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "failed to update item" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string; id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { name, id } = await params;
  try {
    const result = await deleteItem(name, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.plan);
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "failed to delete item" }, { status: 500 });
  }
}
