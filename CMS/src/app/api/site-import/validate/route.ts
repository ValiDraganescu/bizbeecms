/**
 * site-export-import — Import validate + dry-run (FORMAT.md §6 Steps A + B).
 *
 *   POST /api/site-import/validate → the dry-run report, operator-only, NO WRITES.
 *
 * Thin I/O route: parses the posted artifact JSON, counts the TARGET's current
 * rows in every table §6 Step C's WIPE list touches (read-only), and hands
 * both to the PURE `validateSiteImport` validator/report-builder
 * (`lib/site-export/site-import-validate.ts`) — see FORMAT.md §6/§7.
 *
 * Import EXECUTE (the destructive path) is a separate, later route — this one
 * never writes to D1/R2.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/ports/db";
import { contentSelectAll } from "@/lib/content/content-db";
import { validateSiteImport, type DryRunCounts } from "@/lib/site-export/site-import-validate";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let artifact: unknown;
  try {
    artifact = await request.json();
  } catch {
    return Response.json({ ok: false, error: "request body must be valid JSON" }, { status: 400 });
  }

  const report = await validateSiteImport(artifact, async (): Promise<DryRunCounts> => {
    const db = await getDb();
    const [pages, components, collections, dataSources, promptVersions, assets, chatAgents] =
      await Promise.all([
        db.select().from(schema.page),
        db.select().from(schema.component),
        db.select().from(schema.collection),
        db.select().from(schema.dataSource),
        db.select().from(schema.promptVersion),
        db.select().from(schema.asset),
        db.select().from(schema.chatAgent),
      ]);

    // contentSelectAll pages past the 1000-row single-call cap so the dry-run's
    // "existing rows to be destroyed" count is accurate for large collections too.
    let collectionRows = 0;
    for (const c of collections) {
      const rows = await contentSelectAll(`SELECT * FROM ${c.tableName}`);
      collectionRows += rows.length;
    }

    return {
      pages: pages.length,
      components: components.length,
      collections: collections.length,
      collectionRows,
      assets: assets.length,
      dataSources: dataSources.length,
      promptVersions: promptVersions.length,
      chatAgents: chatAgents.length,
    };
  });

  return Response.json(report, { status: report.ok ? 200 : 400 });
}
