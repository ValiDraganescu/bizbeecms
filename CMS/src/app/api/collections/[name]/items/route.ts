/**
 * content-collections — Slice 3: collection items collection-endpoint.
 *
 *   GET  ?status=&archived=live|archived|all&limit=  → list items (simple filter)
 *   POST { ...fieldValues, slug?, status? }          → create an item (structured,
 *                                                       validated, parameterized)
 *
 * `[name]` is the `content_<slug>` table name. Gated to CMS Admin. All writes go
 * through the PURE builders → `contentWrite` (fenced + parameterized) — no
 * freeform SQL. (Full structured query = Slice 4; this list stays simple.)
 */
import { requireAdmin } from "@/lib/auth/guard";
import { listItems, createItem } from "@/db/item-store";
import type { ListOptions } from "@/lib/content/item-write";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { name } = await params;
  const url = new URL(request.url);

  const archivedRaw = url.searchParams.get("archived");
  const opts: ListOptions = {
    status: url.searchParams.get("status") ?? undefined,
    archived:
      archivedRaw === "archived" || archivedRaw === "all" ? archivedRaw : "live",
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  };

  try {
    const result = await listItems(name, opts);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.plan);
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "failed to list items" }, { status: 500 });
  }
}

export async function POST(
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
  const obj = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  try {
    const result = await createItem(name, obj);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.plan, { status: 201 });
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "failed to create item" }, { status: 500 });
  }
}
