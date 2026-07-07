/**
 * Pure decision for the AI live-write post-write coherence hooks (seo-robots).
 *
 * The REST /api/pages route pings IndexNow + purges the edge cache after a
 * write; the AI create_page/translate tools must do the same. This module holds
 * only the PURE decision (which cache tags to purge) so it runs under dep-free
 * `node --test` — the CF-coupled purge/IndexNow calls stay in the tool handler.
 *
 * Rule: a CREATE can't be edge-cached yet (nothing to bust) — no purge; an
 * UPDATE (or a translate, which only ever hits an existing page) may target an
 * already-cached published page — purge its per-page tag. IndexNow is always
 * pinged (collectPageUrls no-ops for noindexed/unpublished pages).
 */
import { pageCacheTag } from "./edge-cache.ts";

export function purgeTagsForPageWrite(
  action: "created" | "updated" | "translated",
  pageId: string,
): string[] {
  return action === "created" ? [] : [pageCacheTag(pageId)];
}
