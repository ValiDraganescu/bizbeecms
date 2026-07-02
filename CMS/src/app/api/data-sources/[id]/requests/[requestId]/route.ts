/**
 * external-data-sources Slice 1 — single saved-request endpoint.
 *
 *   PATCH  → update a saved request (method/path/query/body/cache/retry config)
 *   DELETE → remove it
 *
 * Admin-gated, REST-only. The request must belong to the `[id]` source.
 */
import { requireAdmin } from "@/lib/auth/guard";
import {
  deleteDataSourceRequest,
  updateDataSourceRequest,
} from "@/db/data-source-store";
import { validateRequestInput } from "@/lib/data-sources/validate";
import { pruneApiCacheVersions } from "@/db/settings-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; requestId: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id, requestId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const checked = validateRequestInput(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

  try {
    const updated = await updateDataSourceRequest(id, requestId, checked.value);
    if (!updated) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(updated);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to update request" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id, requestId } = await params;
  try {
    const removed = await deleteDataSourceRequest(id, requestId);
    if (!removed) return Response.json({ error: "not found" }, { status: 404 });
    await pruneApiCacheVersions({ requestIds: [requestId] });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to delete request" },
      { status: 500 },
    );
  }
}
