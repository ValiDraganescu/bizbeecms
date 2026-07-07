/**
 * notifyIndexNow — best-effort IndexNow submission from admin WRITE routes
 * (seo-robots — IndexNow notify).
 *
 * Called after a page publish/unpublish/delete or a path change, with the
 * page's affected absolute URLs. POSTs them to the IndexNow endpoint so
 * participating engines (Bing/Yandex/Seznam/Naver — NOT Google) recrawl
 * immediately.
 *
 * BEST-EFFORT by design, exactly like `purgeEdgeTags`: a missing origin,
 * missing/invalid key, network error, or non-2xx response must NEVER fail the
 * write that triggered it. Every failure collapses to `false`. The pure body
 * building + URL collection live in `indexnow.ts` (dep-free, node-tested); this
 * module is the CF-coupled fetch shell kept out of that harness.
 *
 * Uses `ctx.waitUntil` when a CF context is available so the POST doesn't delay
 * the admin response — the same "don't block the write" principle as purge.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getDb } from "@/db";
import { page as pageTable } from "@/db/schema";
import { getContentLocales, getIndexNowKey } from "@/db/settings-store";
import { resolveSiteOrigin } from "./site-origin.ts";
import { buildSubmission, pageUrlsAllLocales } from "./indexnow.ts";
import type { PathPageRow } from "./localize-paths.ts";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/**
 * Submit an already-collected list of absolute same-origin URLs to IndexNow.
 * Returns true only when the POST was actually made and 2xx. Any problem →
 * false, never throws.
 */
export async function submitIndexNowUrls(urls: string[]): Promise<boolean> {
  try {
    if (urls.length === 0) return false;
    const origin = await resolveSiteOrigin();
    if (!origin) return false;
    const key = await getIndexNowKey();
    const submission = buildSubmission(origin, key, urls);
    if (!submission) return false;
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(submission),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Compute every absolute URL of one page across all content locales, from the
 * CURRENT page table. Best-effort — returns [] on any error / unknown origin /
 * wildcard page. Callers use this to capture a page's URLs BEFORE deleting it
 * (the row is gone afterwards).
 */
export async function collectPageUrls(pageId: string): Promise<string[]> {
  try {
    const db = await getDb();
    const [rows, contentLocales, origin] = await Promise.all([
      db
        .select({
          id: pageTable.id,
          slug: pageTable.slug,
          parentPageId: pageTable.parentPageId,
          localizedSlugs: pageTable.localizedSlugs,
        })
        .from(pageTable),
      getContentLocales(db),
      resolveSiteOrigin(),
    ]);
    if (!origin) return [];
    return pageUrlsAllLocales(
      origin,
      rows as PathPageRow[],
      pageId,
      contentLocales.default,
      contentLocales.locales,
    );
  } catch {
    return [];
  }
}

/**
 * Notify IndexNow about one page by id: compute the page's URLs across every
 * locale (wildcard/unreconstructible pages yield none → no-op) and submit.
 * Best-effort — swallows everything.
 *
 * Wrap in `ctx.waitUntil` so it runs after the response flushes; if no CF
 * context, awaits inline (local dev / tests). Callers fire-and-forget.
 */
export async function notifyIndexNowForPage(pageId: string): Promise<void> {
  const work = collectPageUrls(pageId).then((urls) => submitIndexNowUrls(urls));
  try {
    const { ctx } = getCloudflareContext();
    (ctx as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil?.(work);
  } catch {
    // no CF context — run inline.
    await work;
  }
}

/**
 * Notify IndexNow about an EXPLICIT list of URLs (the delete case, where the
 * page row is already gone so its URLs must be captured before deletion).
 * Best-effort, waitUntil-wrapped like `notifyIndexNowForPage`.
 */
export function notifyIndexNowUrls(urls: string[]): void {
  const work = submitIndexNowUrls(urls).then(() => undefined);
  try {
    const { ctx } = getCloudflareContext();
    (ctx as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil?.(work);
  } catch {
    void work; // no CF context — let it settle; errors already swallowed.
  }
}
