/**
 * site-export-import — Import EXECUTE (FORMAT.md §6 Step C, the destructive path).
 *
 * PURE planner: takes a validated artifact + the confirmation the caller
 * supplied and returns an ORDERED plan of typed steps (wipe, then restore) —
 * no D1/CF/`@/` imports here, node-testable per this repo's "test business
 * logic only" discipline. The route (`app/api/site-import/route.ts`) is the
 * thin executor: it re-validates via `validateSiteImport` first (this route
 * only runs AFTER a validate per the goal's own contract, but re-checks
 * anyway — never trust the caller skipped it), then walks this plan and calls
 * the real `Db`/content-db primitives step by step.
 *
 * Confirmation contract (not pinned by FORMAT.md — decided here): the request
 * body's `confirm` field must equal the artifact's `meta.siteName` EXACTLY
 * (case-sensitive). Empty `meta.siteName` (a source site that never set
 * `site_identity`) can never be confirmed this way — `checkConfirmation`
 * rejects an empty expected name rather than silently accepting `confirm:""`,
 * so a nameless artifact can't be imported by an empty/omitted field.
 */

export const SITE_FORMAT = "bizbeecms.site";
export const SITE_VERSION = 1;
export const MAX_COLLECTIONS = 100;

/** One collection registry row as carried in the artifact's `tables.collection`. */
export interface ArtifactCollectionRow {
  id: string;
  name: string;
  tableName: string;
  schema: string;
  publicSubmissions: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Minimal shape this module needs from a validated `bizbeecms.site` artifact. */
export interface SiteArtifact {
  format: string;
  version: number;
  meta: { exportedAt: string; cmsVersion: string; siteName: string };
  tables: {
    page: Record<string, unknown>[];
    pageVersion: Record<string, unknown>[];
    component: Record<string, unknown>[];
    collection: ArtifactCollectionRow[];
    siteSettings: Record<string, unknown>[];
    promptVersion: Record<string, unknown>[];
    dataSource: Record<string, unknown>[];
    dataSourceRequest: Record<string, unknown>[];
    asset: Record<string, unknown>[];
    /** Added after v1 shipped — optional so pre-chat-agent artifacts still import. */
    chatAgent?: Record<string, unknown>[];
  };
  collectionData: Record<string, { schema: unknown[]; rows: Record<string, unknown>[] }>;
}

export type PlanResult =
  | { ok: true; plan: ImportPlan }
  | { ok: false; status: number; error: string };

/** The ordered destructive plan (§6 Step C, verbatim order). */
export interface ImportPlan {
  /** `content_*` table names to DROP — every row currently in the registry. */
  dropContentTables: string[];
  /** Builtin tables to fully DELETE FROM, in this exact order. */
  wipeBuiltinTables: readonly string[];
  /** Collections to recreate: table name + parsed field schema, in artifact order. */
  restoreCollections: Array<{ tableName: string; fields: unknown[]; rows: Record<string, unknown>[] }>;
  restoreComponents: Record<string, unknown>[];
  restorePages: Record<string, unknown>[];
  restorePageVersions: Record<string, unknown>[];
  restoreSiteSettings: Record<string, unknown>[];
  restorePromptVersions: Record<string, unknown>[];
  /** `secretEnc` is ALWAYS stripped to `null` here — never trust artifact ciphertext. */
  restoreDataSources: Array<Record<string, unknown> & { secretEnc: null }>;
  restoreDataSourceRequests: Record<string, unknown>[];
  restoreAssets: Record<string, unknown>[];
  /** `[]` for pre-chat-agent artifacts (the key is optional in the envelope). */
  restoreChatAgents: Record<string, unknown>[];
}

/**
 * Builtin (non-content_*) tables §6 Step C wipes, in FK-safe / dependency order.
 * Exported so the route's `dropContentTables` count-provider and tests share one
 * source of truth for "what does the destructive path touch".
 */
export const WIPE_BUILTIN_TABLES = [
  "collection",
  "page_version",
  "page",
  "component",
  "data_source_request",
  "data_source",
  "prompt_version",
  "asset",
  "site_settings",
  "chat_agent",
] as const;

/**
 * Never touched by import — the DO-NOT-export list, symmetric on the import
 * side. `chat_conversation` + `usage_counter` are guest-chat HISTORY/analytics:
 * never exported, and never destroyed by an import either (a same-site
 * re-import keeps agent ids, so existing conversations stay linked; on a
 * cross-instance import orphaned history is just invisible, not broken).
 */
export const PRESERVED_TABLES = [
  "user",
  "session",
  "invite",
  "password_reset",
  "login_attempt",
  "api_key",
  "icon_cache",
  "chat_thread",
  "chat_conversation",
  "usage_counter",
] as const;

function fail(status: number, error: string): PlanResult {
  return { ok: false, status, error };
}

/**
 * The confirmation contract: `confirm` must equal the artifact's non-empty
 * `meta.siteName` exactly. A blank/whitespace-only siteName can never be
 * confirmed (there's no meaningful phrase to type), so such an artifact is
 * refused outright rather than accepting an empty/absent `confirm`.
 */
export function checkConfirmation(
  siteName: string,
  confirm: unknown,
): { ok: true } | { ok: false; status: number; error: string } {
  const expected = (siteName ?? "").trim();
  if (!expected) {
    return { ok: false, status: 400, error: "artifact has no meta.siteName to confirm against — cannot import" };
  }
  if (typeof confirm !== "string" || confirm !== expected) {
    return { ok: false, status: 400, error: `confirm must equal the site name exactly: ${JSON.stringify(expected)}` };
  }
  return { ok: true };
}

/** Parse a collection's `schema` JSON column defensively (bad JSON → `[]`), same as export's. */
function parseSchema(schema: string): unknown[] {
  try {
    const parsed = JSON.parse(schema);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Build the full destructive-import plan from a validated artifact. Assumes
 * the caller already ran `validateSiteImport` (format/version/tables-shape) —
 * this function re-checks the same hard constraints defensively (never trust
 * a route skipped validate) and additionally HARD-BLOCKS on the 100-table cap
 * (unlike validate's dry-run, which only warns — FORMAT.md §5 point 5 wants a
 * real block here since this path actually writes).
 *
 * `existingContentTableNames` — the TARGET instance's own `collection`
 * registry table names (what actually exists in ITS D1 right now), supplied
 * by the caller (the route reads its live `collection` table before wiping).
 * `dropContentTables` MUST come from here, not from the artifact's own
 * `tables.collection` — those are the SOURCE site's collections, which on a
 * genuinely different target instance may not exist at all (a fresh/empty
 * target has none) or may differ from the source's set (extra tables the
 * source never had). Dropping a table that was never created 500s the whole
 * import; the two only happen to be identical on a same-instance round-trip,
 * which is why this bug was invisible until a real cross-instance import
 * (empty target) was tried. Defaults to `[]` (safe: nothing to drop) rather
 * than silently falling back to the artifact's list, so a caller that forgets
 * to pass it gets a working "nothing existed yet" plan instead of the old bug.
 */
export function planImport(
  artifact: unknown,
  confirm: unknown,
  existingContentTableNames: string[] = [],
): PlanResult {
  if (artifact === null || typeof artifact !== "object") {
    return fail(400, "artifact must be a JSON object");
  }
  const a = artifact as Record<string, unknown>;
  if (a.format !== SITE_FORMAT) {
    return fail(400, `unsupported format "${String(a.format)}" — expected "${SITE_FORMAT}"`);
  }
  if (a.version !== SITE_VERSION) {
    return fail(400, `unsupported version ${JSON.stringify(a.version)} — expected ${SITE_VERSION}`);
  }
  const tables = a.tables;
  if (tables === null || typeof tables !== "object") {
    return fail(400, '"tables" must be an object');
  }
  const t = tables as SiteArtifact["tables"];
  const REQUIRED_TABLE_KEYS = [
    "page", "pageVersion", "component", "collection", "siteSettings",
    "promptVersion", "dataSource", "dataSourceRequest", "asset",
  ] as const;
  for (const key of REQUIRED_TABLE_KEYS) {
    if (!Array.isArray((t as Record<string, unknown>)[key])) {
      return fail(400, `tables.${key} must be an array`);
    }
  }
  // Optional post-v1 key: missing → empty, but a present non-array is still junk.
  if ("chatAgent" in t && !Array.isArray(t.chatAgent)) {
    return fail(400, "tables.chatAgent must be an array when present");
  }

  const meta = (a.meta ?? {}) as { siteName?: unknown };
  const siteName = typeof meta.siteName === "string" ? meta.siteName : "";
  const confirmed = checkConfirmation(siteName, confirm);
  if (!confirmed.ok) return confirmed;

  if (t.collection.length > MAX_COLLECTIONS) {
    return fail(
      400,
      `tables.collection has ${t.collection.length} entries, exceeding the ${MAX_COLLECTIONS}-table cap — refusing to execute`,
    );
  }

  const collectionData =
    a.collectionData !== null && typeof a.collectionData === "object"
      ? (a.collectionData as SiteArtifact["collectionData"])
      : {};

  const restoreCollections = t.collection.map((c) => ({
    tableName: c.tableName,
    fields: collectionData[c.tableName]?.schema ?? parseSchema(c.schema),
    rows: collectionData[c.tableName]?.rows ?? [],
  }));

  const restoreDataSources = t.dataSource.map((r) => ({ ...r, secretEnc: null as null }));

  return {
    ok: true,
    plan: {
      dropContentTables: existingContentTableNames,
      wipeBuiltinTables: WIPE_BUILTIN_TABLES,
      restoreCollections,
      restoreComponents: t.component,
      restorePages: t.page,
      restorePageVersions: t.pageVersion,
      restoreSiteSettings: t.siteSettings,
      restorePromptVersions: t.promptVersion,
      restoreDataSources,
      restoreDataSourceRequests: t.dataSourceRequest,
      restoreAssets: t.asset,
      restoreChatAgents: t.chatAgent ?? [],
    },
  };
}
