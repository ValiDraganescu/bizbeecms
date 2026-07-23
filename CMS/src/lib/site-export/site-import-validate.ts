/**
 * site-export-import — Import validate + dry-run (FORMAT.md §6 Steps A + B).
 *
 * PURE validator + report-builder: takes a parsed artifact (whatever JSON the
 * client POSTs) and an injected `willDestroy` count-provider (the route
 * supplies real D1 counts; tests supply a fixture) and returns the dry-run
 * report. No D1/CF/`@/` imports — node-testable, per FORMAT.md §7's own
 * instruction and this repo's "test business logic only" discipline.
 *
 * NO WRITES happen here or in the route that calls this — see FORMAT.md §6
 * Step C ("Import execute") for the destructive path, a later task.
 */

export const SITE_FORMAT = "bizbeecms.site";
export const SITE_VERSION = 1;

/** Every `tables.*` key the envelope must have, per FORMAT.md §3. */
const REQUIRED_TABLE_KEYS = [
  "page",
  "pageVersion",
  "component",
  "collection",
  "siteSettings",
  "promptVersion",
  "dataSource",
  "dataSourceRequest",
  "asset",
] as const;

/**
 * `tables.*` keys added AFTER v1 shipped — OPTIONAL on import (older artifacts
 * simply don't have them; missing → treated as empty), but if present they must
 * still be arrays. Keeps version 1 backward-compatible instead of hard-failing
 * every pre-chat-agent export.
 */
const OPTIONAL_TABLE_KEYS = ["chatAgent"] as const;

export const MAX_COLLECTIONS = 100;

export interface DryRunCounts {
  pages: number;
  components: number;
  collections: number;
  collectionRows: number;
  assets: number;
  dataSources: number;
  promptVersions: number;
  chatAgents: number;
}

/** Injected by the route: counts of the TARGET's current rows in every table
 * §6 Step C's WIPE list touches (read-only — this function does no writes). */
export type WillDestroyProvider = () => DryRunCounts | Promise<DryRunCounts>;

export interface DryRunReport {
  ok: boolean;
  /** Present only when `ok` is false — the hard-fail reason. */
  error?: string;
  willDestroy: DryRunCounts;
  willCreate: Record<string, number>;
  secretsToReenter: Array<{ name: string; authType: string }>;
  collectionCapOk: boolean;
  warnings: string[];
}

const EMPTY_DESTROY: DryRunCounts = {
  pages: 0,
  components: 0,
  collections: 0,
  collectionRows: 0,
  assets: 0,
  dataSources: 0,
  promptVersions: 0,
  chatAgents: 0,
};

function hardFail(error: string): DryRunReport {
  return {
    ok: false,
    error,
    willDestroy: EMPTY_DESTROY,
    willCreate: {},
    secretsToReenter: [],
    collectionCapOk: false,
    warnings: [],
  };
}

/**
 * Step A (validate, hard-fail) + Step B (dry-run report). Named the exact bad
 * key/value per this repo's error philosophy — no generic "invalid artifact".
 */
export async function validateSiteImport(
  artifact: unknown,
  getWillDestroy: WillDestroyProvider,
): Promise<DryRunReport> {
  if (artifact === null || typeof artifact !== "object") {
    return hardFail("artifact must be a JSON object");
  }
  const a = artifact as Record<string, unknown>;

  if (a.format !== SITE_FORMAT) {
    return hardFail(`unsupported format "${String(a.format)}" — expected "${SITE_FORMAT}"`);
  }
  if (a.version !== SITE_VERSION) {
    return hardFail(`unsupported version ${JSON.stringify(a.version)} — expected ${SITE_VERSION}`);
  }

  const tables = a.tables;
  if (tables === null || typeof tables !== "object") {
    return hardFail('"tables" must be an object');
  }
  const t = tables as Record<string, unknown>;
  for (const key of REQUIRED_TABLE_KEYS) {
    if (!Array.isArray(t[key])) {
      return hardFail(`tables.${key} must be an array`);
    }
  }
  for (const key of OPTIONAL_TABLE_KEYS) {
    if (key in t && !Array.isArray(t[key])) {
      return hardFail(`tables.${key} must be an array when present`);
    }
  }

  const collections = t.collection as unknown[];
  const collectionCapOk = collections.length <= MAX_COLLECTIONS;

  const collectionData = a.collectionData;
  const collectionDataObj: Record<string, { rows?: unknown[] }> =
    collectionData !== null && typeof collectionData === "object"
      ? (collectionData as Record<string, { rows?: unknown[] }>)
      : {};
  const collectionRows = Object.values(collectionDataObj).reduce(
    (sum, c) => sum + (Array.isArray(c?.rows) ? c.rows.length : 0),
    0,
  );

  const willCreate: Record<string, number> = {
    pages: (t.page as unknown[]).length,
    pageVersions: (t.pageVersion as unknown[]).length,
    components: (t.component as unknown[]).length,
    collections: collections.length,
    collectionRows,
    assets: (t.asset as unknown[]).length,
    dataSources: (t.dataSource as unknown[]).length,
    dataSourceRequests: (t.dataSourceRequest as unknown[]).length,
    promptVersions: (t.promptVersion as unknown[]).length,
    chatAgents: Array.isArray(t.chatAgent) ? t.chatAgent.length : 0,
  };

  const warnings: string[] = [];
  if (!collectionCapOk) {
    warnings.push(
      `tables.collection has ${collections.length} entries, exceeding the ${MAX_COLLECTIONS}-table cap`,
    );
  }

  const counts = a.counts;
  if (counts !== null && typeof counts === "object") {
    const c = counts as Record<string, unknown>;
    for (const [key, actual] of Object.entries(willCreate)) {
      if (key in c && c[key] !== actual) {
        warnings.push(`counts.${key} (${String(c[key])}) doesn't match tables data (${actual})`);
      }
    }
  }

  const secretsToReenter = (t.dataSource as Array<Record<string, unknown>>)
    .filter((r) => r.hasSecret === true)
    .map((r) => ({ name: String(r.name ?? ""), authType: String(r.authType ?? "") }));

  const willDestroy = await getWillDestroy();

  return {
    ok: true,
    willDestroy,
    willCreate,
    secretsToReenter,
    collectionCapOk,
    warnings,
  };
}
