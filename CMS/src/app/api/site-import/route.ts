/**
 * site-export-import — Import EXECUTE (FORMAT.md §6 Step C, the destructive path).
 *
 *   POST /api/site-import → wipes the target's content/design tables and
 *   restores everything from the posted `bizbeecms.site` artifact.
 *   Operator-only, DESTRUCTIVE, requires an explicit `confirm` field (see
 *   `checkConfirmation` in `lib/site-export/site-import-execute.ts`).
 *
 * This route re-validates the envelope itself (format/version/tables-shape +
 * the 100-table cap, HARD-BLOCKING here unlike the warning-only dry-run) via
 * the PURE `planImport` — never trust that the caller already ran
 * `POST /api/site-import/validate` first, even though that's the intended
 * flow. No asset bytes here — those upload via a separate per-key route
 * (`POST /api/site-import/asset/<key>`, FORMAT.md §4), a follow-up task.
 *
 * Idempotency: the wipe (steps 1-3 below) is UNCONDITIONAL, so a second POST
 * of the same artifact after a mid-way failure is safe to retry as-is —
 * FORMAT.md §6's own idempotency note, no rollback machinery needed.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/ports/db";
import { contentDdl, contentWrite } from "@/lib/content/content-db";
import { buildCreateTableSql, type CollectionField } from "@/lib/content/collection-schema";
import { planImport, type SiteArtifact } from "@/lib/site-export/site-import-execute";

export const dynamic = "force-dynamic";

/** Epoch-ms number (or already a Date, defensive) → Date, for Drizzle timestamp_ms columns. */
function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  const n = Number(v);
  return new Date(Number.isFinite(n) ? n : 0);
}

/** Insert one artifact row into a builtin table, converting its date-ish keys. */
function withDates<T extends Record<string, unknown>>(row: T, dateKeys: string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of dateKeys) if (k in out) out[k] = toDate(out[k]);
  return out as T;
}

/**
 * D1's per-statement bound-parameter cap is 100 — `db.insert(table).values([...])`
 * compiles ALL rows into ONE multi-row INSERT with every cell bound, so a wide
 * table (e.g. `component`'s 16 columns) blows the cap after only ~6 rows and the
 * whole statement 500s (confirmed empirically: 8 `component` rows = 128 params =
 * fails; 5 rows = 80 params = succeeds). Chunk by the actual column count so any
 * current/future table stays under the cap with margin, rather than a fixed
 * per-table guess.
 */
const MAX_D1_PARAMS = 90; // margin under D1's 100-bound-param ceiling.

async function insertRows<T extends Record<string, unknown>>(
  insertFn: (rows: T[]) => Promise<unknown>,
  rows: T[],
): Promise<void> {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]).length || 1;
  const chunkSize = Math.max(1, Math.floor(MAX_D1_PARAMS / cols));
  for (let i = 0; i < rows.length; i += chunkSize) {
    await insertFn(rows.slice(i, i + chunkSize));
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "request body must be valid JSON" }, { status: 400 });
  }

  const b = (body ?? {}) as { artifact?: unknown; confirm?: unknown };
  const planned = planImport(b.artifact, b.confirm);
  if (!planned.ok) {
    return Response.json({ ok: false, error: planned.error }, { status: planned.status });
  }
  const plan = planned.plan;
  const artifact = b.artifact as SiteArtifact;

  const db = await getDb();

  // --- WIPE (§6 Step C, exact order) ---
  // 1. DROP every content_* table currently in the registry (fenced).
  for (const tableName of plan.dropContentTables) {
    await contentDdl(`DROP TABLE ${tableName}`);
  }
  // 2 + 3. Delete all rows from every builtin table the wipe touches, in order.
  // Never touches user/session/invite/password_reset/login_attempt/api_key/
  // icon_cache/chat_thread (not in WIPE_BUILTIN_TABLES).
  await db.delete(schema.collection);
  await db.delete(schema.pageVersion);
  await db.delete(schema.page);
  await db.delete(schema.component);
  await db.delete(schema.dataSourceRequest);
  await db.delete(schema.dataSource);
  await db.delete(schema.promptVersion);
  await db.delete(schema.asset);
  await db.delete(schema.siteSettings);

  // --- RESTORE (§6 Step C, dependency order) ---
  // 4. Recreate each collection's content_* table (fenced DDL, never hand-authored)
  // then insert its rows via parameterized contentWrite.
  for (const c of plan.restoreCollections) {
    const createSql = buildCreateTableSql(c.tableName, c.fields as CollectionField[]);
    await contentDdl(createSql);
    for (const row of c.rows) {
      const cols = Object.keys(row);
      if (cols.length === 0) continue;
      const placeholders = cols.map(() => "?").join(", ");
      await contentWrite(
        `INSERT INTO ${c.tableName} (${cols.join(", ")}) VALUES (${placeholders})`,
        cols.map((col) => row[col]),
      );
    }
  }
  // Registry rows themselves go through the normal Db port (collection is on
  // the fence's BUILTIN_DENYLIST by design, not through contentWrite).
  await insertRows(
    (rows) => db.insert(schema.collection).values(rows as (typeof schema.collection.$inferInsert)[]),
    artifact.tables.collection.map((r) =>
      withDates(r as unknown as Record<string, unknown>, ["createdAt", "updatedAt"]),
    ),
  );

  // 5. Components.
  await insertRows(
    (rows) => db.insert(schema.component).values(rows as (typeof schema.component.$inferInsert)[]),
    plan.restoreComponents.map((r) => withDates(r, ["createdAt", "updatedAt"])),
  );
  // 6. Pages, then page versions.
  await insertRows(
    (rows) => db.insert(schema.page).values(rows as (typeof schema.page.$inferInsert)[]),
    plan.restorePages.map((r) => withDates(r, ["createdAt", "updatedAt"])),
  );
  await insertRows(
    (rows) => db.insert(schema.pageVersion).values(rows as (typeof schema.pageVersion.$inferInsert)[]),
    plan.restorePageVersions.map((r) => withDates(r, ["createdAt"])),
  );
  // 7. Site settings.
  await insertRows(
    (rows) => db.insert(schema.siteSettings).values(rows as (typeof schema.siteSettings.$inferInsert)[]),
    plan.restoreSiteSettings.map((r) => withDates(r, ["updatedAt"])),
  );
  // 8. Prompt versions, data sources (secretEnc already nulled by planImport),
  // data source requests.
  await insertRows(
    (rows) => db.insert(schema.promptVersion).values(rows as (typeof schema.promptVersion.$inferInsert)[]),
    plan.restorePromptVersions.map((r) => withDates(r, ["createdAt"])),
  );
  await insertRows(
    (rows) => db.insert(schema.dataSource).values(rows as (typeof schema.dataSource.$inferInsert)[]),
    plan.restoreDataSources.map((r) => withDates(r, ["createdAt", "updatedAt"])),
  );
  await insertRows(
    (rows) => db.insert(schema.dataSourceRequest).values(rows as (typeof schema.dataSourceRequest.$inferInsert)[]),
    plan.restoreDataSourceRequests.map((r) => withDates(r, ["createdAt", "updatedAt"])),
  );
  // 9. Asset metadata rows (bytes arrive via the separate per-key upload leg, §4).
  await insertRows(
    (rows) => db.insert(schema.asset).values(rows as (typeof schema.asset.$inferInsert)[]),
    plan.restoreAssets.map((r) => withDates(r, ["createdAt"])),
  );

  return Response.json({
    ok: true,
    restored: {
      pages: plan.restorePages.length,
      pageVersions: plan.restorePageVersions.length,
      components: plan.restoreComponents.length,
      collections: plan.restoreCollections.length,
      collectionRows: plan.restoreCollections.reduce((sum, c) => sum + c.rows.length, 0),
      assets: plan.restoreAssets.length,
      dataSources: plan.restoreDataSources.length,
      dataSourceRequests: plan.restoreDataSourceRequests.length,
      promptVersions: plan.restorePromptVersions.length,
    },
    assetKeysToUpload: plan.restoreAssets
      .map((a) => (typeof a.key === "string" ? a.key : null))
      .filter((k): k is string => k !== null),
  });
}
