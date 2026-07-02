/**
 * content-collections — Slice 2: single-collection REST endpoint.
 *
 *   GET                       → describe one collection (registry row + fields)
 *   PATCH { field: {...} }     → ADD a field (ADD-ONLY v1): ALTER TABLE ADD COLUMN
 *                                (fenced) + update the registry schema JSON
 *   DELETE                     → drop the table (fenced) + delete the registry row
 *
 * `[name]` is the `content_<slug>` table name (the collection's stable handle).
 * Gated to CMS Admin. DDL is SYSTEM-generated and runs ONLY through the fence.
 * REST-only, no server actions.
 */
import { requireAdmin } from "@/lib/auth/guard";
import {
  addCollectionField,
  deleteCollection,
  getCollection,
  rebuildCollectionSchema,
  setPublicSubmissions,
} from "@/db/collection-store";
import type { SchemaChange } from "@/lib/content/schema-rebuild";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { name } = await params;
  try {
    const view = await getCollection(name);
    if (!view) return Response.json({ error: "collection not found" }, { status: 404 });
    return Response.json(view);
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "failed to load collection" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { name } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  // `_op` selects schema evolution beyond v1 ADD-ONLY (drop/rename a field via the
  // safe table-rebuild). Without `_op`, the body is an add-field (`{ field: {...} }`).
  const op = obj._op;
  try {
    // Form-block opt-in toggle: may PUBLIC visitors submit DRAFT items into this
    // collection via a page Form? Explicit per-collection flag, default OFF.
    if (op === "set_public_submissions") {
      const result = await setPublicSubmissions(name, obj.enabled === true);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json(result.plan);
    }

    if (op === "drop_field" || op === "rename_field") {
      const field = typeof obj.field === "string" ? obj.field : "";
      const change: SchemaChange =
        op === "drop_field"
          ? { op: "drop", field }
          : { op: "rename", field, to: typeof obj.to === "string" ? obj.to : "" };
      const result = await rebuildCollectionSchema(name, change);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json(result.plan);
    }

    const result = await addCollectionField(name, obj.field);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.plan);
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "failed to update collection" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { name } = await params;
  try {
    const result = await deleteCollection(name);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.plan);
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "failed to delete collection" }, { status: 500 });
  }
}
