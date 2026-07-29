/**
 * Helpers SHARED by multiple tool-dispatch handler modules (draft-blocks I/O,
 * self-correcting "unknown X" errors, source+request resolution). Split out of
 * `tool-dispatch.ts` so the per-domain handler modules don't duplicate them —
 * one implementation, imported everywhere. CF-coupled (imports `@/db/*`) like
 * the handlers; pure dispatch logic stays in `tool-dispatch-core.ts`.
 */
import { getDraft, saveDraftBlocks } from "@/db/page-version-store";
import { listComponents } from "@/db/component-store";
import { listCollections } from "@/db/collection-store";
import {
  listDataSources,
  listDataSourceRequests,
  type SafeDataSource,
  type SafeDataSourceRequest,
} from "@/db/data-source-store";
import type { Block } from "@/lib/render/tree";

// The AI page tools read+write the page's DRAFT version — the SAME store the
// Page Builder editor and the preview iframe use (`/api/pages/[id]/draft` →
// saveDraftBlocks). Writing legacy `page.blocks` instead made AI edits invisible
// in the builder (the draft-based preview never reads page.blocks). These two
// helpers mirror getPageBlocks/setPageBlocks against the draft.

/** Read the page's draft blocks (create-if-absent), or null if the page is gone. */
export async function getDraftBlocks(
  pageId: string,
): Promise<{ id: string; blocks: Block[]; meta: string } | null> {
  const draft = await getDraft(pageId);
  if (!draft) return null;
  let blocks: Block[];
  try {
    blocks = JSON.parse(draft.blocks) as Block[];
  } catch {
    blocks = [];
  }
  return { id: pageId, blocks, meta: draft.meta };
}

/**
 * Persist blocks to the page's draft version (the editor's write path). Preserves
 * the draft's existing `meta` — the blocks editor never changes meta, so neither
 * do we (pass the meta read alongside the blocks via getDraftBlocks).
 */
export async function setDraftBlocks(
  pageId: string,
  blocks: Block[],
  meta: string,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const saved = await saveDraftBlocks(pageId, { blocks: JSON.stringify(blocks), meta });
  return saved ? { ok: true } : { ok: false, errors: ["page not found"] };
}

/** Actionable "unknown component" error: name the missing ones + list what exists. */
export async function unknownComponentMessage(missing: string[]): Promise<string> {
  let existing: string[] = [];
  try {
    existing = (await listComponents()).map((c) => c.name);
  } catch {
    /* unbound D1 */
  }
  const have = existing.length > 0
    ? ` Existing components you can use: ${existing.join(", ")}.`
    : " This Site has no components yet.";
  return (
    `These components don't exist (create them with create_component first, ` +
    `BEFORE referencing them in a page): ${missing.join(", ")}.${have}`
  );
}

/** Actionable "no such collection" error: name the requested one + list real ones. */
export async function unknownCollectionMessage(requested: string): Promise<string> {
  const cols = await listCollections();
  if (cols.length === 0) {
    return `Collection "${requested}" does not exist, and this Site has no collections yet. Create one with create_collection before querying.`;
  }
  const list = cols
    .map((c) => `${c.tableName} (${c.fields.map((f) => f.name).join(", ") || "no user fields"})`)
    .join("; ");
  return (
    `Collection "${requested}" does not exist. Use one of these exact table names: ${list}. ` +
    `Collection tables are prefixed "content_" — pass the full table name (e.g. content_restaurants), not the bare label.`
  );
}

export type ResolvedSourceRequest =
  | { ok: true; source: SafeDataSource; request: SafeDataSourceRequest }
  | { ok: false; error: string };

/**
 * Resolve a source + saved request from the model's refs (id OR name), with
 * self-correcting errors that list what actually exists (AI error philosophy).
 */
export async function resolveSourceAndRequest(
  sourceRef: string,
  requestRef: string,
): Promise<ResolvedSourceRequest> {
  const sources = await listDataSources();
  const source =
    sources.find((s) => s.id === sourceRef) ?? sources.find((s) => s.name === sourceRef);
  if (!source) {
    if (sources.length === 0) {
      return { ok: false, error: `no data source "${sourceRef}" — this site has no API data sources yet (create one with create_data_source)` };
    }
    const names = sources.map((s) => `${s.name} (${s.id})`).join(", ");
    return { ok: false, error: `no data source "${sourceRef}". Available sources: ${names}` };
  }
  const requests = await listDataSourceRequests(source.id);
  const request =
    requests.find((r) => r.id === requestRef) ?? requests.find((r) => r.name === requestRef);
  if (!request) {
    if (requests.length === 0) {
      return { ok: false, error: `source "${source.name}" has no saved requests yet — add one (create_data_source with \`requests\`, or the operator via Data Sources)` };
    }
    const names = requests.map((r) => `${r.name} (${r.id})`).join(", ");
    return { ok: false, error: `no saved request "${requestRef}" on source "${source.name}". Available requests: ${names}` };
  }
  return { ok: true, source, request };
}
