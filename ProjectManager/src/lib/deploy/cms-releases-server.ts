import { type CmsRelease } from "./cms-releases";
import manifest from "./releases.generated.json";

/**
 * The deployable CMS release list (newest-first, pre-trimmed), baked into the
 * bundle by `/cms-release` (from `release-notes/*.md`). Used by the site list
 * page's "update available" indicator (Slice 6) and the `/api/cms-releases/tags`
 * proxy (Slice 5). No deployer call — it's a static import; kept async-shaped so
 * existing `await` callers don't change.
 */
export async function fetchCmsReleases(): Promise<CmsRelease[]> {
  return manifest.releases.map(({ version, tag }) => ({ version, tag }));
}
