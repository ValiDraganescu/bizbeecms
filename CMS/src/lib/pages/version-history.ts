/**
 * Page versioning slice 4 — PURE selection/sort logic for the history UI.
 *
 * The store's `listVersions` returns ALL `page_version` rows (drafts +
 * published) newest-first. The history view only wants the PUBLISHED versions
 * (you restore from / view a published snapshot, not the working draft), each
 * tagged with whether it's the page's CURRENTLY-LIVE version. This module is the
 * dep-free, node-testable algebra; the route + component just render its output.
 */

import type { VersionRecord } from "./page-version.ts";

/** A published version annotated for the history list. */
export interface HistoryEntry {
  id: string;
  versionNo: number;
  createdAt: number;
  /** True for the version `page.published_version_id` currently points at. */
  isCurrent: boolean;
}

/**
 * Build the history list: keep only PUBLISHED versions, newest first (highest
 * `version_no`), each flagged `isCurrent` when it's the live published pointer.
 * Drafts (versionNo 0) are excluded — they're the working copy, not history.
 */
export function buildHistory(
  versions: VersionRecord[],
  publishedVersionId: string | null,
): HistoryEntry[] {
  return versions
    .filter((v) => v.status === "published")
    .sort((a, b) => b.versionNo - a.versionNo)
    .map((v) => ({
      id: v.id,
      versionNo: v.versionNo,
      createdAt: v.createdAt,
      isCurrent: v.id === publishedVersionId,
    }));
}
