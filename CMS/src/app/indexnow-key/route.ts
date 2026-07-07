/**
 * IndexNow ownership key file (seo-robots — IndexNow notify).
 *
 * Serves the per-Site IndexNow key as plaintext at the fixed `INDEXNOW_KEY_PATH`
 * (`/indexnow-key`). IndexNow engines fetch this to verify we own the host
 * before accepting a submission whose `keyLocation` points here. The key is
 * generated once and persisted (getIndexNowKey).
 *
 *   GET /indexnow-key → text/plain body = the key
 *
 * MUST be dynamic — reads per-request D1, which build-time prerender can't
 * (same trap sitemap.ts hit). It's a dotted-root sibling to /sitemap.xml so the
 * worker edge-cache gate already excludes it; but the path has no dot, so we
 * also set no-store here to be explicit (a stale key file breaks verification).
 */
import { getIndexNowKey } from "@/db/settings-store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const key = await getIndexNowKey();
  return new Response(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
