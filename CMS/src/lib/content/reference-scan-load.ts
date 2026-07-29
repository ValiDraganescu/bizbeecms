/**
 * reference-scan-load — the thin CF loader for the pure reference scanner
 * (`reference-scan.ts`). Loads the whole reference surface — every page's live
 * + draft blocks, every component's live + draft tree, every chat agent's
 * allowlists — and hands plain JSON to `findReferences`. The delete-guard
 * handlers (delete_data_source / delete_data_source_request / delete_collection)
 * call `findSiteReferences` and, when it returns hits, refuse with
 * `describeReferences`.
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
  findReferences,
  type Reference,
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
export async function loadScanInput(injectedDb?: Db): Promise<ScanInput> {
  const db = injectedDb ?? (await getDb());

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
    const draftRaw = p.draftVersionId ? draftBlocksById.get(p.draftVersionId) : undefined;
    return {
      id: p.id,
      title: pagePath(p, byId),
      blocks: parseJsonColumn<unknown>(p.blocks, []),
      draftBlocks: draftRaw !== undefined ? parseJsonColumn<unknown>(draftRaw, []) : undefined,
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

  return { pages, components, chatAgents };
}

/**
 * The one call the delete guards make: every reference to `target` across the
 * site. Empty = safe to delete; non-empty → refuse with `describeReferences`.
 */
export async function findSiteReferences(
  target: ScanTarget,
  injectedDb?: Db,
): Promise<Reference[]> {
  return findReferences(await loadScanInput(injectedDb), target);
}
