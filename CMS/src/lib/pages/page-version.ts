/**
 * Page versioning — PURE transition logic (Versioning slice 1).
 *
 * USER DECISION MODEL (2026-06-19): a page keeps its history in a separate
 * `page_version(id, page_id, blocks, meta, status, version_no, created_at)`
 * table; the `page` row points at a `draft_version_id` (editable now) and a
 * `published_version_id` (live). The transitions are:
 *   - create-draft  : a fresh draft version (from a source version, or empty).
 *   - set-draft     : overwrite the draft version's blocks/meta in place.
 *   - publish        : copy the draft → a NEW published version (version_no bumps),
 *                      set published_version_id, THEN auto-create a fresh draft
 *                      copied from the just-published version so editing continues.
 *   - restore        : copy a PAST version → a NEW draft.
 *
 * This module is the data-shape/algebra ONLY — no D1, no `getDb`, fully
 * node-testable. The store wrappers in `db/page-version-store.ts` load rows,
 * call these planners, and persist the resulting writes. Keeping the algebra
 * pure is what makes "publish → auto-draft", "version_no monotonic", and
 * "restore copies, never mutates" provable without a binding.
 */

/** A version row as stored in `page_version` (blocks/meta are JSON strings). */
export interface VersionRecord {
  id: string;
  pageId: string;
  blocks: string;
  meta: string;
  status: "draft" | "published";
  versionNo: number;
  createdAt: number;
}

/** The page-row fields versioning owns (the rest of `page` is unchanged). */
export interface PageVersionPointers {
  draftVersionId: string | null;
  publishedVersionId: string | null;
}

/** Minimal seed for a brand-new version record (id/time injected by the caller). */
export interface VersionSeed {
  blocks: string;
  meta: string;
}

const EMPTY_BLOCKS = "[]";
const EMPTY_META = "{}";

/**
 * The next published `version_no`: one past the highest existing published
 * number (drafts don't count toward the published sequence). Monotonic and
 * gap-free as long as it's only ever called on publish. First publish → 1.
 */
export function nextVersionNo(versions: VersionRecord[]): number {
  let max = 0;
  for (const v of versions) {
    if (v.status === "published" && v.versionNo > max) max = v.versionNo;
  }
  return max + 1;
}

/**
 * Plan a fresh DRAFT version copied from `source` (or empty when there's no
 * source — a never-published page). A draft carries `versionNo: 0` (it's not
 * part of the published sequence; only publish assigns a real number). The
 * caller stamps `id`/`createdAt` and writes the row + sets `draftVersionId`.
 */
export function planDraftFrom(
  pageId: string,
  source: VersionRecord | null,
): { record: Omit<VersionRecord, "id" | "createdAt"> } {
  return {
    record: {
      pageId,
      blocks: source ? source.blocks : EMPTY_BLOCKS,
      meta: source ? source.meta : EMPTY_META,
      status: "draft",
      versionNo: 0,
    },
  };
}

/**
 * Plan a PUBLISH: snapshot the current `draft` into a new published version,
 * then a fresh draft copied from that snapshot (so the operator keeps editing).
 * Returns the two records to insert + the new pointer values. The caller stamps
 * ids/timestamps and persists.
 *
 * - `published` gets the next monotonic `version_no`.
 * - the auto-draft copies the just-published blocks/meta (REFINED behavior 3).
 * - `published_version_id` → the new published version; `draft_version_id` →
 *   the new auto-draft (the old draft row is left as history, harmless).
 */
export function planPublish(
  draft: VersionRecord,
  allVersions: VersionRecord[],
): {
  published: Omit<VersionRecord, "id" | "createdAt">;
  autoDraft: Omit<VersionRecord, "id" | "createdAt">;
  pointers: PageVersionPointers;
  // ids are placeholders the caller MUST replace; pointers reference them by role.
} {
  const versionNo = nextVersionNo(allVersions);
  const published: Omit<VersionRecord, "id" | "createdAt"> = {
    pageId: draft.pageId,
    blocks: draft.blocks,
    meta: draft.meta,
    status: "published",
    versionNo,
  };
  const autoDraft: Omit<VersionRecord, "id" | "createdAt"> = {
    pageId: draft.pageId,
    blocks: draft.blocks,
    meta: draft.meta,
    status: "draft",
    versionNo: 0,
  };
  // pointers carry no ids here — the store sets them after inserting; this
  // shape just declares INTENT. The store wires real ids (see page-version-store).
  return {
    published,
    autoDraft,
    pointers: { draftVersionId: null, publishedVersionId: null },
  };
}

/**
 * Plan a RESTORE: copy a past `version` into a NEW draft (never mutate the
 * source — restore must be non-destructive). Same shape as `planDraftFrom`
 * but named for intent; the store sets `draft_version_id` to the new row.
 */
export function planRestore(version: VersionRecord): {
  record: Omit<VersionRecord, "id" | "createdAt">;
} {
  return planDraftFrom(version.pageId, version);
}

/** Apply a blocks/meta edit to a draft record IN PLACE (immutable copy). */
export function applyDraftEdit(draft: VersionRecord, seed: VersionSeed): VersionRecord {
  return { ...draft, blocks: seed.blocks, meta: seed.meta };
}

/**
 * Pick which JSON `blocks` string a route should render (Versioning slice 2).
 *
 * Pure + node-testable — no D1. The store wrappers load the version row (or
 * null), and the route passes the result here along with the legacy
 * `page.blocks`. The block SOURCE is the ONLY thing that changes between
 * routes; the render pipeline (`buildPlanFromPage`/`RenderedPage`) is shared.
 *
 *   - PUBLIC route  : prefer the PUBLISHED version; else fall back to
 *     `page.blocks` (legacy pages predating versioning have no version rows).
 *   - PREVIEW route : prefer the DRAFT version; else the PUBLISHED version
 *     (just published, no draft yet); else `page.blocks` (legacy). Preview
 *     always shows the latest editable state, falling back to live.
 *
 * `version` is the resolved version record for the route's preferred status
 * (published for public, draft for preview), `fallbackVersion` is the
 * secondary (published, for preview only — pass null for the public route),
 * and `legacyBlocks` is `page.blocks`.
 */
export function pickRenderBlocks(
  version: VersionRecord | null,
  fallbackVersion: VersionRecord | null,
  legacyBlocks: string,
): string {
  if (version) return version.blocks;
  if (fallbackVersion) return fallbackVersion.blocks;
  return legacyBlocks;
}
