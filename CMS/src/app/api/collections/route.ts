/**
 * content-collections — Slice 2: collections collection-level REST endpoint.
 *
 *   GET  → list collections (registry rows; admin only)
 *   POST { name, fields[] } → create a collection: enforce the 100-collection
 *          cap, derive `content_<slug>`, generate + run (fenced) the CREATE TABLE,
 *          write the registry row. 409 on cap/collision, 400 on bad schema.
 *
 * REST-only, no server actions (PM directive). Gated to CMS Admin via
 * `requireAdmin`. The DDL is SYSTEM-generated (Slice 1) and runs ONLY through the
 * Slice-0 fence (`contentDdl`) — no raw SQL crosses this boundary.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { createCollection, listCollections } from "@/db/collection-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await listCollections());
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "failed to list collections" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  try {
    const result = await createCollection(obj.name, obj.fields);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.plan, { status: 201 });
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "failed to create collection" }, { status: 500 });
  }
}
