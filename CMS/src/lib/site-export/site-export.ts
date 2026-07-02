/**
 * site-export-import — Export core (tracer, no asset bytes).
 *
 * PURE serializer: takes already-fetched D1 rows (Drizzle `$inferSelect` shapes)
 * and builds the `bizbeecms.site` v1 envelope exactly per
 * `.orchestrator/meeseeks/goals/site-export-import/FORMAT.md` §3. No D1/CF
 * imports here — the route (`app/api/site-export/route.ts`) does all the I/O
 * and calls this function, so the shape/format logic is node-testable per the
 * repo's "test business logic only" discipline.
 *
 * Dates: every `timestamp_ms` Drizzle column comes back as a `Date` (or already
 * a number, for a hand-built test fixture) — normalized to epoch-ms via
 * `toEpochMs`, the same pattern `collection-store.ts`'s `toView` uses.
 *
 * Data-source secrets: `secretEnc` is NEVER included — `hasSecret` is derived
 * instead (mirrors `data-source-store.ts`'s `toSafeSource`), per FORMAT.md §1
 * and GOAL.md's hard constraint.
 */

export const SITE_FORMAT = "bizbeecms.site";
export const SITE_VERSION = 1 as const;

function toEpochMs(v: Date | number | null | undefined): number {
  if (v == null) return 0;
  return v instanceof Date ? v.getTime() : Number(v);
}

/** Minimal row shapes this module needs — structurally compatible with the
 * Drizzle `$inferSelect` types in `db/schema.ts` (kept local so this file has
 * zero runtime imports from the app). */
export interface PageRow {
  id: string;
  slug: string;
  parentPageId: string | null;
  displayOrder: number;
  publishStatus: string;
  blocks: string;
  metaTitle: string;
  metaDescription: string;
  metaImage: string;
  draftVersionId: string | null;
  publishedVersionId: string | null;
  createdAt: Date | number;
  updatedAt: Date | number;
}

export interface PageVersionRow {
  id: string;
  pageId: string;
  blocks: string;
  meta: string;
  status: string;
  versionNo: number;
  createdAt: Date | number;
}

export interface ComponentRow {
  id: string;
  name: string;
  html: string;
  script: string;
  css: string;
  label: string | null;
  propsSchema: string | null;
  draftHtml: string | null;
  draftScript: string | null;
  draftCss: string | null;
  draftLabel: string | null;
  draftPropsSchema: string | null;
  hasDraft: boolean;
  sourceKit: string | null;
  tags: string;
  createdAt: Date | number;
  updatedAt: Date | number;
}

export interface CollectionRow {
  id: string;
  name: string;
  tableName: string;
  schema: string;
  publicSubmissions: boolean;
  createdAt: Date | number;
  updatedAt: Date | number;
}

export interface SiteSettingRow {
  key: string;
  value: string;
  updatedAt: Date | number;
}

export interface PromptVersionRow {
  id: string;
  label: string;
  prompt: string;
  createdAt: Date | number;
}

export interface DataSourceRow {
  id: string;
  name: string;
  baseUrl: string;
  authType: string;
  authParam: string | null;
  secretEnc: string | null;
  createdAt: Date | number;
  updatedAt: Date | number;
}

export interface DataSourceRequestRow {
  id: string;
  sourceId: string;
  name: string;
  method: string;
  path: string;
  query: string;
  bodyTemplate: string | null;
  cacheEnabled: boolean;
  cacheTtlSec: number;
  retryable: boolean;
  createdAt: Date | number;
  updatedAt: Date | number;
}

export interface AssetRow {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  size: number;
  description: string;
  tags: string;
  createdAt: Date | number;
}

/** A collection's rows as exported: `SELECT *` result, one generic object per row. */
export type CollectionDataRow = Record<string, unknown>;

export interface SiteExportInput {
  pages: PageRow[];
  pageVersions: PageVersionRow[];
  components: ComponentRow[];
  collections: CollectionRow[];
  siteSettings: SiteSettingRow[];
  promptVersions: PromptVersionRow[];
  dataSources: DataSourceRow[];
  dataSourceRequests: DataSourceRequestRow[];
  assets: AssetRow[];
  /** tableName → rows (already `SELECT *`'d by the caller via `contentSelect`). */
  collectionData: Record<string, CollectionDataRow[]>;
  /** Injected so the envelope is reproducible in tests; route passes `new Date().toISOString()`. */
  exportedAt: string;
  /** `package.json`'s `version`, injected by the route. */
  cmsVersion: string;
}

export interface SiteEnvelope {
  format: typeof SITE_FORMAT;
  version: typeof SITE_VERSION;
  meta: { exportedAt: string; cmsVersion: string; siteName: string };
  counts: {
    pages: number;
    pageVersions: number;
    components: number;
    collections: number;
    collectionRows: number;
    assets: number;
    dataSources: number;
    dataSourceRequests: number;
    promptVersions: number;
  };
  tables: {
    page: Array<Record<string, unknown>>;
    pageVersion: Array<Record<string, unknown>>;
    component: Array<Record<string, unknown>>;
    collection: Array<Record<string, unknown>>;
    siteSettings: Array<{ key: string; value: string; updatedAt: number }>;
    promptVersion: Array<Record<string, unknown>>;
    dataSource: Array<Record<string, unknown> & { hasSecret: boolean }>;
    dataSourceRequest: Array<Record<string, unknown>>;
    asset: Array<Record<string, unknown>>;
  };
  collectionData: Record<string, { schema: unknown[]; rows: CollectionDataRow[] }>;
}

/** Best-effort site name from a `site_identity` settings row — never throws. */
function readSiteName(settings: SiteSettingRow[]): string {
  const row = settings.find((s) => s.key === "site_identity");
  if (!row) return "";
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed?.name === "string" ? parsed.name : "";
  } catch {
    return "";
  }
}

/** Parse a collection's `schema` JSON column defensively (bad JSON → `[]`). */
function parseCollectionSchema(schema: string): unknown[] {
  try {
    const parsed = JSON.parse(schema);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Build the `bizbeecms.site` v1 envelope from already-fetched rows. Pure — no
 * I/O. Drops `data_source.secretEnc` and asset bytes (§4 is a later task).
 */
export function buildSiteExport(input: SiteExportInput): SiteEnvelope {
  const collectionRows = Object.values(input.collectionData).reduce(
    (sum, rows) => sum + rows.length,
    0,
  );

  const collectionData: SiteEnvelope["collectionData"] = {};
  for (const c of input.collections) {
    collectionData[c.tableName] = {
      schema: parseCollectionSchema(c.schema),
      rows: input.collectionData[c.tableName] ?? [],
    };
  }

  return {
    format: SITE_FORMAT,
    version: SITE_VERSION,
    meta: {
      exportedAt: input.exportedAt,
      cmsVersion: input.cmsVersion,
      siteName: readSiteName(input.siteSettings),
    },
    counts: {
      pages: input.pages.length,
      pageVersions: input.pageVersions.length,
      components: input.components.length,
      collections: input.collections.length,
      collectionRows,
      assets: input.assets.length,
      dataSources: input.dataSources.length,
      dataSourceRequests: input.dataSourceRequests.length,
      promptVersions: input.promptVersions.length,
    },
    tables: {
      page: input.pages.map((r) => ({
        id: r.id,
        slug: r.slug,
        parentPageId: r.parentPageId,
        displayOrder: r.displayOrder,
        publishStatus: r.publishStatus,
        blocks: r.blocks,
        metaTitle: r.metaTitle,
        metaDescription: r.metaDescription,
        metaImage: r.metaImage,
        draftVersionId: r.draftVersionId,
        publishedVersionId: r.publishedVersionId,
        createdAt: toEpochMs(r.createdAt),
        updatedAt: toEpochMs(r.updatedAt),
      })),
      pageVersion: input.pageVersions.map((r) => ({
        id: r.id,
        pageId: r.pageId,
        blocks: r.blocks,
        meta: r.meta,
        status: r.status,
        versionNo: r.versionNo,
        createdAt: toEpochMs(r.createdAt),
      })),
      component: input.components.map((r) => ({
        id: r.id,
        name: r.name,
        html: r.html,
        script: r.script,
        css: r.css,
        label: r.label,
        propsSchema: r.propsSchema,
        draftHtml: r.draftHtml,
        draftScript: r.draftScript,
        draftCss: r.draftCss,
        draftLabel: r.draftLabel,
        draftPropsSchema: r.draftPropsSchema,
        hasDraft: r.hasDraft,
        sourceKit: r.sourceKit,
        tags: r.tags,
        createdAt: toEpochMs(r.createdAt),
        updatedAt: toEpochMs(r.updatedAt),
      })),
      collection: input.collections.map((r) => ({
        id: r.id,
        name: r.name,
        tableName: r.tableName,
        schema: r.schema,
        publicSubmissions: r.publicSubmissions,
        createdAt: toEpochMs(r.createdAt),
        updatedAt: toEpochMs(r.updatedAt),
      })),
      siteSettings: input.siteSettings.map((r) => ({
        key: r.key,
        value: r.value,
        updatedAt: toEpochMs(r.updatedAt),
      })),
      promptVersion: input.promptVersions.map((r) => ({
        id: r.id,
        label: r.label,
        prompt: r.prompt,
        createdAt: toEpochMs(r.createdAt),
      })),
      // NEVER include secretEnc — hasSecret derived instead (FORMAT.md §1, GOAL.md
      // hard constraint). Mirrors data-source-store.ts's toSafeSource.
      dataSource: input.dataSources.map((r) => ({
        id: r.id,
        name: r.name,
        baseUrl: r.baseUrl,
        authType: r.authType,
        authParam: r.authParam,
        hasSecret: r.secretEnc != null && r.secretEnc !== "",
        createdAt: toEpochMs(r.createdAt),
        updatedAt: toEpochMs(r.updatedAt),
      })),
      dataSourceRequest: input.dataSourceRequests.map((r) => ({
        id: r.id,
        sourceId: r.sourceId,
        name: r.name,
        method: r.method,
        path: r.path,
        query: r.query,
        bodyTemplate: r.bodyTemplate,
        cacheEnabled: r.cacheEnabled,
        cacheTtlSec: r.cacheTtlSec,
        retryable: r.retryable,
        createdAt: toEpochMs(r.createdAt),
        updatedAt: toEpochMs(r.updatedAt),
      })),
      // Metadata only — no R2 bytes yet (BACKLOG's "Export assets" task).
      asset: input.assets.map((r) => ({
        id: r.id,
        key: r.key,
        filename: r.filename,
        contentType: r.contentType,
        size: r.size,
        description: r.description,
        tags: r.tags,
        createdAt: toEpochMs(r.createdAt),
      })),
    },
    collectionData,
  };
}
