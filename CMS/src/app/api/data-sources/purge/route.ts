/**
 * external-data-sources Slice 7 — GLOBAL "purge all API cache".
 *
 *   POST → bump the global cache-version counter; every cached external-API
 *          response becomes unaddressable (the Cache-API impl can't enumerate
 *          keys, so purge = version bump — see lib/data-sources/purge.ts).
 *
 * Admin-gated, REST-only. (The static `purge` segment can't collide with
 * `[id]` — source ids are UUIDs.)
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getApiCacheVersions, setApiCacheVersions } from "@/db/settings-store";
import { bumpGlobal } from "@/lib/data-sources/purge";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    await setApiCacheVersions(bumpGlobal(await getApiCacheVersions()));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to purge API cache" },
      { status: 500 },
    );
  }
}
