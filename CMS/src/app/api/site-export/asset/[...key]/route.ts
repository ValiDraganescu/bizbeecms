/**
 * site-export-import — Export assets (FORMAT.md §4's per-asset leg).
 *
 *   GET /api/site-export/asset/<key> → raw bytes of ONE asset, operator-only.
 *
 * `tables.asset` in the `GET /api/site-export` envelope already lists every
 * asset's metadata + key (Export core's scope). This route is the second leg:
 * the export UI (or a script) calls it once per key to pull the R2 bytes
 * alongside `site.json` — no single-zip ceiling, see FORMAT.md §4.
 *
 * Content-type comes from the `asset` D1 row (the source of truth for export,
 * matching what the envelope already claims for that key), not R2
 * `httpMetadata` — keeps this route trivially fakeable in tests (a `Storage`
 * stub only needs `get`, no `asset-store.ts`/`Db` coupling for content-type).
 *
 * `isValidAssetKey` guards traversal, same as the public `/media/<key>` route.
 * REST-only, no server action.
 */
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/ports/db";
import { getStorage } from "@/lib/ports/storage";
import { isValidAssetKey } from "@/lib/render/asset";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { key: segments } = await params;
  const key = (segments ?? []).join("/");
  if (!isValidAssetKey(key)) {
    return new Response("not found", { status: 404 });
  }

  const db = await getDb();
  const [row] = await db.select().from(schema.asset).where(eq(schema.asset.key, key)).limit(1);
  if (!row) {
    return new Response("not found", { status: 404 });
  }

  const storage = await getStorage();
  const object = await storage.get(key);
  if (!object) {
    return new Response("not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "content-type": row.contentType,
      "content-disposition": `attachment; filename="${row.filename.replace(/"/g, "")}"`,
    },
  });
}
