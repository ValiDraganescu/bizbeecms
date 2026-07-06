/**
 * purgeEdgeTags — best-effort Workers Cache tag purge from admin WRITE routes.
 *
 * Publish/unpublish/delete purge the per-page tag (`page:<id>`, see
 * `pageCacheTag`); global-blast writes (theme colors/fonts, brand identity,
 * component publish, content-locale settings) purge the shared `pages` tag
 * (`PAGES_CACHE_TAG`) so every cached published page re-renders on next hit.
 *
 * BEST-EFFORT by design: `ctx.cache` may not exist (local dev / plain
 * `next dev` without a CF context) and `purge` may throw — a purge failure
 * must NEVER fail the write that triggered it. Every failure mode collapses
 * to `false`.
 *
 * CF-coupled (getCloudflareContext) on purpose; the pure logic lives in
 * `edge-cache.ts` (`purgeCacheTags`) so it stays under dep-free `node --test`.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { purgeCacheTags } from "./edge-cache";

export async function purgeEdgeTags(...tags: string[]): Promise<boolean> {
  try {
    const { ctx } = getCloudflareContext();
    return await purgeCacheTags((ctx as { cache?: unknown }).cache, tags);
  } catch {
    return false; // no CF context at all — nothing to purge
  }
}
