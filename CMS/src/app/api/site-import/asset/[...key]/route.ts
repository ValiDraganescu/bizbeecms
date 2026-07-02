/**
 * site-export-import — Import asset bytes (FORMAT.md §4's second import leg).
 *
 *   POST /api/site-import/asset/<key> → raw bytes in the request body, operator-only.
 *
 * Import EXECUTE (`POST /api/site-import`) already inserted every `asset`
 * metadata row and returns `assetKeysToUpload: string[]` as the checklist —
 * this route is the upload counterpart, one call per key, mirroring
 * `GET /api/site-export/asset/<key>`'s shape/guard style.
 *
 * The key must already exist in the `asset` table (restored by execute) —
 * refuses to `Storage.put` bytes under a key the metadata doesn't know about,
 * so an operator can't smuggle an arbitrary object into R2 via this route.
 * Content-type is READ FROM THE ALREADY-RESTORED ROW, never trusted from the
 * client's `content-type` header — the row is the source of truth (same
 * value the export side put in the artifact), so a mismatched/missing header
 * on the upload call can't corrupt what gets served later.
 *
 * `isValidAssetKey` guards traversal, same as export's asset route.
 * REST-only, no server action.
 */
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/ports/db";
import { getStorage } from "@/lib/ports/storage";
import { isValidAssetKey } from "@/lib/render/asset";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { key: segments } = await params;
  const key = (segments ?? []).join("/");
  if (!isValidAssetKey(key)) {
    return Response.json({ ok: false, error: "invalid asset key" }, { status: 404 });
  }

  const db = await getDb();
  const [row] = await db.select().from(schema.asset).where(eq(schema.asset.key, key)).limit(1);
  if (!row) {
    return Response.json(
      { ok: false, error: `asset key "${key}" is not in the restored asset table — run import execute first` },
      { status: 404 },
    );
  }

  const bytes = await request.arrayBuffer();
  const storage = await getStorage();
  await storage.put(key, bytes, { contentType: row.contentType });

  return Response.json({ ok: true, key, size: bytes.byteLength });
}
