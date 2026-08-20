import type { Rollout, Site, User } from "@/db/schema";
import { listSitesForUser } from "@/lib/site/site";
import { fetchCmsReleases } from "@/lib/deploy/cms-releases-server";
import { refForVersion } from "@/lib/deploy/cms-releases";
import {
  planRolloutItem,
  type RolloutPlanAction,
} from "@/lib/deploy/rollout-plan";

/**
 * Shared planning step for `POST /api/rollouts` and its `/preview` dry-run:
 * validate the chosen version against the release list, scope the requested
 * Site ids to what THIS user may deploy (listSitesForUser is exactly that set
 * — scoped Admin/Manager by country/tags, Editor by assignment), and classify
 * every target with the upgrade-only planner.
 */

/**
 * Who may pause/resume/stop a rollout: its creator, or a SuperAdmin/Admin
 * (safety controls shouldn't require hunting down whoever started it).
 */
export function canControlRollout(user: User, rollout: Rollout): boolean {
  return (
    rollout.createdBy === user.id ||
    user.role === "SuperAdmin" ||
    user.role === "Admin"
  );
}

export type RolloutPlanRow = {
  siteId: string;
  name: string;
  slug: string;
  /** What the Site runs now (stored ref, `main`, or null = never deployed). */
  from: string | null;
  action: RolloutPlanAction;
};

export type RolloutPlanError = "invalidVersion" | "noSites";

export type RolloutPlanResult =
  | { ok: true; version: string; ref: string; rows: RolloutPlanRow[]; sites: Map<string, Site> }
  | { ok: false; error: RolloutPlanError };

export async function planRolloutForUser(
  user: User,
  siteIds: unknown,
  version: unknown,
): Promise<RolloutPlanResult> {
  const releases = await fetchCmsReleases();
  const chosen =
    typeof version === "string"
      ? releases.find((r) => r.version === version)
      : undefined;
  if (!chosen) return { ok: false, error: "invalidVersion" };

  const requested = Array.isArray(siteIds)
    ? siteIds.filter((v): v is string => typeof v === "string")
    : [];
  if (requested.length === 0) return { ok: false, error: "noSites" };

  // Authz by construction: ids not in the user's own list are silently dropped
  // — the list IS the set they may deploy.
  const reachable = new Map(
    (await listSitesForUser(user)).map((s) => [s.id, s]),
  );
  const targets: Site[] = [];
  const seen = new Set<string>();
  for (const id of requested) {
    const site = reachable.get(id);
    if (site && !seen.has(id)) {
      seen.add(id);
      targets.push(site);
    }
  }
  if (targets.length === 0) return { ok: false, error: "noSites" };

  const rows: RolloutPlanRow[] = targets.map((site) => ({
    siteId: site.id,
    name: site.name,
    slug: site.slug,
    from: site.deployedCmsVersion ?? null,
    action: planRolloutItem(site.deployedCmsVersion, chosen.version),
  }));

  return {
    ok: true,
    version: chosen.version,
    ref: refForVersion(chosen.version),
    rows,
    sites: new Map(targets.map((s) => [s.id, s])),
  };
}
