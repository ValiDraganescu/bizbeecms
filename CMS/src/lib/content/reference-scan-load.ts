/**
 * reference-scan-load — the thin CF loader for the pure reference scanner
 * (`reference-scan.ts`). Loads the whole reference surface — every page's live
 * + draft blocks, every component's live + draft tree, every chat agent's
 * allowlists — and hands plain JSON to `findReferences`. The delete-guard
 * handlers (delete_data_source / delete_data_source_request / delete_collection)
 * call `deleteBlockedReason` and refuse when it returns a message.
 *
 * FAIL CLOSED (G2 fix): a page whose blocks JSON does not parse could hide a
 * reference, so a parse failure does NOT degrade to "no references" — it is
 * collected as a `ScanFailure` and the guard refuses the delete, naming the
 * unparseable page (`describeScanFailures`). Component HTML parsing is lenient
 * (`parseHtml` never throws), so components cannot fail today, but the failure
 * channel covers both entities.
 *
 * Same surface `site-export.ts`'s route walks; reads D1 ONLY via the `Db` port
 * (sole-reader invariant). Effects only — all matching logic is in the pure
 * core, tested by scripts/reference-scan.test.mjs.
 */
import { inArray } from "drizzle-orm";
import { getDb, schema, type Db } from "../ports/db.ts";
import { parseJsonColumn } from "../render/tree.ts";
import { parseHtml } from "../render/parse-html.ts";
import { listChatAgents } from "../../db/chat-agent-store.ts";
import {
  describeReferences,
  describeScanFailures,
  findReferences,
  type ScanFailure,
  type ScanInput,
  type ScanPage,
  type ScanTarget,
} from "./reference-scan.ts";

/** Parse an agent allowlist JSON column defensively (bad JSON → []). */
function parseAllowlist(json: string): unknown {
  return parseJsonColumn<unknown>(json, []);
}

/** Build each page's human label: its slug path ("/", "/menu/lunch", …). */
function pagePath(
  page: { slug: string; parentPageId: string | null },
  byId: Map<string, { slug: string; parentPageId: string | null }>,
): string {
  const segments: string[] = [];
  let current: { slug: string; parentPageId: string | null } | undefined = page;
  // Depth cap guards against a corrupt parent cycle.
  for (let depth = 0; current && depth < 20; depth++) {
    if (current.slug) segments.unshift(current.slug);
    current = current.parentPageId ? byId.get(current.parentPageId) : undefined;
  }
  return `/${segments.join("/")}`;
}

/** Load the full reference surface (pages + components + agents) as ScanInput. */
async function loadScanInput(
  injectedDb?: Db,
): Promise<{ input: ScanInput; failures: ScanFailure[] }> {
  const db = injectedDb ?? (await getDb());
  const failures: ScanFailure[] = [];

  // Parse a blocks JSON column, RECORDING a failure instead of degrading to []
  // — the caller fails closed on any recorded failure. Empty/NULL is a
  // legitimately blockless page, not a failure.
  const parseBlocks = (raw: string | null | undefined, label: string, detail: string): unknown => {
    if (raw == null || raw === "") return [];
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      failures.push({ entity: "page", label, detail });
      return [];
    }
  };

  const pageRows = await db
    .select({
      id: schema.page.id,
      slug: schema.page.slug,
      parentPageId: schema.page.parentPageId,
      blocks: schema.page.blocks,
      draftVersionId: schema.page.draftVersionId,
    })
    .from(schema.page);

  // Draft blocks live in the page's draft version row (page.blocks stays the
  // authoritative live set — see page-version-store.ts).
  const draftIds = pageRows.map((p) => p.draftVersionId).filter((x): x is string => !!x);
  const draftRows = draftIds.length
    ? await db
        .select({ id: schema.pageVersion.id, blocks: schema.pageVersion.blocks })
        .from(schema.pageVersion)
        .where(inArray(schema.pageVersion.id, draftIds))
    : [];
  const draftBlocksById = new Map(draftRows.map((v) => [v.id, v.blocks]));

  const byId = new Map(pageRows.map((p) => [p.id, p]));
  const pages: ScanPage[] = pageRows.map((p) => {
    const label = pagePath(p, byId);
    const draftRaw = p.draftVersionId ? draftBlocksById.get(p.draftVersionId) : undefined;
    return {
      id: p.id,
      title: label,
      blocks: parseBlocks(p.blocks, label, "blocks JSON"),
      draftBlocks:
        draftRaw !== undefined ? parseBlocks(draftRaw, label, "draft blocks JSON") : undefined,
    };
  });

  const compRows = await db
    .select({
      id: schema.component.id,
      name: schema.component.name,
      html: schema.component.html,
      draftHtml: schema.component.draftHtml,
      hasDraft: schema.component.hasDraft,
    })
    .from(schema.component);
  const components = compRows.map((c) => ({
    id: c.id,
    name: c.name,
    tree: parseHtml(c.html),
    draftTree: c.hasDraft && c.draftHtml != null ? parseHtml(c.draftHtml) : undefined,
  }));

  const agentRows = await listChatAgents(db);
  const chatAgents = agentRows.map((a) => ({
    id: a.id,
    name: a.name,
    dataSources: parseAllowlist(a.dataSources),
    collections: parseAllowlist(a.collections),
  }));

  return { input: { pages, components, chatAgents }, failures };
}

/**
 * The one call the delete guards make. Empty string = safe to delete;
 * non-empty = the self-correcting refusal message — either the existing
 * references (`describeReferences`) or, FAIL CLOSED, the pages/components
 * whose stored content could not be parsed (`describeScanFailures`).
 */
export async function deleteBlockedReason(
  target: ScanTarget,
  targetName: string,
  injectedDb?: Db,
): Promise<string> {
  const { input, failures } = await loadScanInput(injectedDb);
  if (failures.length > 0) return describeScanFailures(target, targetName, failures);
  return describeReferences(target, targetName, findReferences(input, target));
}
