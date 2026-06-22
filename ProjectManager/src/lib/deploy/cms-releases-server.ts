import { getCloudflareContext } from "@opennextjs/cloudflare";
import { normalizeReleases, type CmsRelease } from "./cms-releases";

/**
 * Server-only: fetch the deployer's `GET /tags` once and return the normalised,
 * newest-first `cms-v*` release list. Used by the `/api/cms-releases/tags` proxy
 * (Slice 5) AND the site list page (Slice 6 "update available" indicator), so we
 * fetch the tag list ONCE per request — no N+1 per row, no self-HTTP from the
 * page. Degrades to `[]` on any failure / missing config so the caller renders no
 * badge rather than erroring.
 */
export async function fetchCmsReleases(): Promise<CmsRelease[]> {
  const { env } = await getCloudflareContext({ async: true });
  const bag = env as unknown as Record<string, unknown>;
  const deployerUrl = typeof bag.DEPLOYER_URL === "string" ? bag.DEPLOYER_URL : "";
  const deployerSecret =
    typeof bag.DEPLOYER_SECRET === "string" ? bag.DEPLOYER_SECRET : "";
  if (!deployerUrl || !deployerSecret) return [];

  try {
    const res = await fetch(`${deployerUrl.replace(/\/+$/, "")}/tags`, {
      headers: { authorization: `Bearer ${deployerSecret}` },
    });
    if (!res.ok) return [];
    const payload = await res.json().catch(() => ({}));
    return normalizeReleases(payload);
  } catch {
    return [];
  }
}
