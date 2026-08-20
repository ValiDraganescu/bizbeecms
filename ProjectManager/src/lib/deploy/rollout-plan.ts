/**
 * Rollout planning — classify what deploying `targetVersion` means for one
 * Site (fleet-deploy). Pure (no Cloudflare/db deps) → runs under `node --test`.
 *
 * The upgrade-only rule (USER DECISION): a rollout only moves sites FORWARD.
 *  - already on the target            → skip (`skip_up_to_date`)
 *  - on a NEWER tagged version        → skip (`skip_newer`) — downgrades are
 *    blocked; rolling back a bad release means cutting a new patch tag.
 *  - on an OLDER tagged version       → `upgrade`
 *  - on `main`/any untagged ref       → `move_to_tag` (not comparable, so
 *    moving onto any tagged release is allowed — that's the way OFF `main`)
 *  - never deployed (no version)      → `install`
 * The per-row one-off Redeploy is a different action (rebuild, same version
 * allowed) and does not go through this planner.
 */

import { parseCmsTag } from "./cms-version.ts";
import { cmpSemverDesc } from "./cms-releases.ts";

export type RolloutPlanAction =
  | "install"
  | "upgrade"
  | "move_to_tag"
  | "skip_up_to_date"
  | "skip_newer";

/** The subset of plan actions that actually dispatch a deploy. */
export function planWillDeploy(action: RolloutPlanAction): boolean {
  return action === "install" || action === "upgrade" || action === "move_to_tag";
}

/** The `skipReason` persisted on a skipped rollout item, else null. */
export function planSkipReason(
  action: RolloutPlanAction,
): "up_to_date" | "newer" | null {
  if (action === "skip_up_to_date") return "up_to_date";
  if (action === "skip_newer") return "newer";
  return null;
}

/**
 * Classify one Site. `deployedCmsVersion` is the stored ref (`r-x.y.z`,
 * legacy `cms-vx.y.z`, `main`, junk, or null); `targetVersion` is the bare
 * semver of the chosen release (already validated against the release list by
 * the caller).
 */
export function planRolloutItem(
  deployedCmsVersion: string | null | undefined,
  targetVersion: string,
): RolloutPlanAction {
  if (!deployedCmsVersion) return "install";
  const current = parseCmsTag(deployedCmsVersion);
  if (!current) return "move_to_tag"; // `main` / untagged — not comparable
  const cmp = cmpSemverDesc(current, targetVersion);
  if (cmp === 0) return "skip_up_to_date";
  // cmpSemverDesc sorts newer first: < 0 means `current` is newer than target.
  return cmp < 0 ? "skip_newer" : "upgrade";
}
