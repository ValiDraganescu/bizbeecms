/**
 * external-data-sources Slice 7 — per-source / per-request cache purge.
 *
 *   POST → body `{ requestId?: string }`. With a requestId, bump that saved
 *          request's version counter (scoped eviction); without one, bump the
 *          whole source's counter. Old entries become unaddressable — the
 *          Cache-API impl can't enumerate keys (see lib/data-sources/purge.ts).
 *
 * Admin-gated, REST-only.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getDataSource, listDataSourceRequests } from "@/db/data-source-store";
import { getApiCacheVersions, setApiCacheVersions } from "@/db/settings-store";
import { bumpRequest, bumpSource } from "@/lib/data-sources/purge";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;

  let requestId: string | null = null;
  try {
    const body = (await request.json()) as { requestId?: unknown };
    if (typeof body?.requestId === "string" && body.requestId !== "") {
      requestId = body.requestId;
    }
  } catch {
    // no/empty body = purge the whole source
  }

  try {
    const source = await getDataSource(id);
    if (!source) return Response.json({ error: "not found" }, { status: 404 });

    if (requestId) {
      const owned = (await listDataSourceRequests(id)).some((r) => r.id === requestId);
      if (!owned) return Response.json({ error: "not found" }, { status: 404 });
    }

    const versions = await getApiCacheVersions();
    await setApiCacheVersions(
      requestId ? bumpRequest(versions, requestId) : bumpSource(versions, id),
    );
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to purge API cache" },
      { status: 500 },
    );
  }
}
