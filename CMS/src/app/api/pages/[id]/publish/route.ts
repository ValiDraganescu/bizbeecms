/**
 * CMS page PUBLISH REST endpoint (page-builder Versioning slice 3) — snapshots
 * the page's current DRAFT into a new PUBLISHED version (bumping version_no) and
 * auto-creates a fresh draft to keep editing (publishDraft, slice 1 algebra).
 * After this the PUBLIC route renders the new published version.
 *
 *   POST → { ok: true, versionNo } | { error }
 *
 * REST-only, no server actions (they 500 on OpenNext/Workers). Version algebra
 * in `lib/pages/page-version.ts`; D1 in `db/page-version-store.ts`.
 */
import { publishDraft } from "@/db/page-version-store";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const res = await publishDraft(id);
    if (!res) return Response.json({ error: "page not found" }, { status: 404 });
    return Response.json({ ok: true, versionNo: res.published.versionNo });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to publish" },
      { status: 500 },
    );
  }
}
