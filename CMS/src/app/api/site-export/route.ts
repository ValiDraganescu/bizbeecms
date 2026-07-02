/**
 * site-export-import — Export core (tracer, no asset bytes).
 *
 *   GET /api/site-export → the `bizbeecms.site` v1 envelope (JSON), operator-only.
 *
 * Thin I/O route: fetches every exportable table via the `Db` port (Drizzle) +
 * every `content_*` row via the fenced `contentSelect` read path, then hands the
 * rows to the PURE `buildSiteExport` serializer (`lib/site-export/site-export.ts`)
 * — see FORMAT.md §3/§7. Asset R2 BYTES are NOT included yet (§4, a later task);
 * `tables.asset` is metadata only.
 *
 * REST-only (PM directive), gated to CMS Admin via `requireAdmin`.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/ports/db";
import { contentSelectAll } from "@/lib/content/content-db";
import { buildSiteExport, type CollectionDataRow } from "@/lib/site-export/site-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const db = await getDb();

  const [
    pages,
    pageVersions,
    components,
    collections,
    siteSettings,
    promptVersions,
    dataSources,
    dataSourceRequests,
    assets,
  ] = await Promise.all([
    db.select().from(schema.page),
    db.select().from(schema.pageVersion),
    db.select().from(schema.component),
    db.select().from(schema.collection),
    db.select().from(schema.siteSettings),
    db.select().from(schema.promptVersion),
    db.select().from(schema.dataSource),
    db.select().from(schema.dataSourceRequest),
    db.select().from(schema.asset),
  ]);

  // Every content_* table's rows, via the fenced read path (FORMAT.md §3's
  // "generic SELECT * → JSON" rule). `contentSelectAll` PAGES past the single-call
  // MAX_READ_ROWS (1000) cap so a >1000-row collection exports in full instead of
  // silently truncating — export must be lossless, unlike ordinary app reads.
  const collectionData: Record<string, CollectionDataRow[]> = {};
  for (const c of collections) {
    collectionData[c.tableName] = await contentSelectAll<CollectionDataRow>(
      `SELECT * FROM ${c.tableName}`,
    );
  }

  const envelope = buildSiteExport({
    pages,
    pageVersions,
    components,
    collections,
    siteSettings,
    promptVersions,
    dataSources,
    dataSourceRequests,
    assets,
    collectionData,
    exportedAt: new Date().toISOString(),
    cmsVersion: process.env.NEXT_PUBLIC_CMS_VERSION ?? "",
  });

  return new Response(JSON.stringify(envelope, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="site-export.json"`,
    },
  });
}
