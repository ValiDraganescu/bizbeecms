/**
 * CMS page VERSION HISTORY REST endpoint (page-builder Versioning slice 4) —
 * lists the page's PUBLISHED versions for the history UI, flagging the live one.
 *
 *   GET → { versions: [{ id, versionNo, createdAt, isCurrent }] }
 *
 * Block-source selection / history shaping is the PURE `buildHistory`
 * (lib/pages/version-history.ts); D1 reads via `db/page-version-store.ts`.
 * REST-only, no server actions (they 500 on OpenNext/Workers).
 */
import { eq } from "drizzle-orm";
import { listVersions } from "@/db/page-version-store";
import { getDb } from "@/db";
import { page as pageTable } from "@/db/schema";
import { buildHistory } from "@/lib/pages/version-history";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const db = await getDb();
    const rows = await db
      .select({ publishedVersionId: pageTable.publishedVersionId })
      .from(pageTable)
      .where(eq(pageTable.id, id))
      .limit(1);
    if (rows.length === 0) return Response.json({ error: "page not found" }, { status: 404 });

    const versions = await listVersions(id, db);
    return Response.json({ versions: buildHistory(versions, rows[0].publishedVersionId) });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load versions" },
      { status: 500 },
    );
  }
}
