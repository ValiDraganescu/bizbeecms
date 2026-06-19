/**
 * CMS page RESTORE REST endpoint (page-builder Versioning slice 4) — copies a
 * PAST version into a NEW draft (source untouched) and points the page's draft
 * at it, so the operator can edit + re-Publish it as a new version.
 *
 *   POST { versionId } → { ok: true } | { error }
 *
 * Wraps `newDraftFromVersion` (db/page-version-store.ts → planRestore algebra).
 * After this the shell re-loads the draft (GET /api/pages/[id]/draft) and sees
 * the restored blocks. REST-only, no server actions.
 */
import { newDraftFromVersion } from "@/db/page-version-store";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const versionId = typeof body.versionId === "string" ? body.versionId : "";
  if (!versionId) return Response.json({ error: "versionId required" }, { status: 400 });

  try {
    const draft = await newDraftFromVersion(id, versionId);
    if (!draft) return Response.json({ error: "version not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to restore" },
      { status: 500 },
    );
  }
}
