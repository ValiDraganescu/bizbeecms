import type { Rollout, RolloutItem } from "@/db/schema";
import { findSiteById } from "@/lib/site/site";
import { canStartDeploy } from "@/lib/deploy";
import { dispatchSiteDeploy } from "@/lib/deploy/dispatch";
import {
  applyItemResult,
  nextDispatches,
  type ItemResult,
} from "@/lib/deploy/rollout-engine";
import {
  claimItemForBuild,
  failUnstartedItem,
  findActiveRollout,
  listRolloutItems,
  settleBuildingItem,
  updateRollout,
} from "@/lib/deploy/rollout-store";

/**
 * Rollout runner — glues the pure engine to the store and the deploy dispatch.
 *
 * The queue advances on DEPLOY RESOLUTIONS, not on a timer: both terminal
 * paths (the deployer's callback and the timeout reaper) call
 * `onSiteDeployResolved`, which settles the matching building item, applies
 * the breaker, and refills free slots from the queue. `GET /api/rollouts/
 * active` additionally calls `sweepStaleBuildingItems` so an item whose
 * resolution was missed entirely (e.g. the reaper fired for a user who wasn't
 * polling the rollout) still settles from the Site row's actual status.
 *
 * Every caller wraps these in try/catch (best-effort): rollout bookkeeping
 * must never break the deploy status latch it piggybacks on.
 */

/**
 * A Site's deploy reached `deployed`/`failed`. No-op unless an active rollout
 * has that Site in `building`.
 */
export async function onSiteDeployResolved(
  siteId: string,
  result: ItemResult,
  error?: string | null,
): Promise<void> {
  const rollout = await findActiveRollout();
  if (!rollout) return;
  const items = await listRolloutItems(rollout.id);
  const item = items.find(
    (i) => i.siteId === siteId && i.status === "building",
  );
  if (!item) return;
  await settleAndRefill(rollout, items, item, result, error ?? null);
}

/**
 * Fill free build slots from the queue — used on create and resume. Insta-
 * failures (site gone, busy, dispatch error) settle through the same breaker/
 * finished logic as real build failures.
 */
export async function dispatchQueuedItems(
  rollout: Rollout,
  items: RolloutItem[],
): Promise<void> {
  await fillSlots({ ...rollout }, items);
}

/**
 * Safety net for missed resolutions: any `building` item whose Site is no
 * longer `deploying` settles from the Site row's terminal status.
 */
export async function sweepStaleBuildingItems(
  rollout: Rollout,
  items: RolloutItem[],
): Promise<boolean> {
  let swept = false;
  for (const item of items) {
    if (item.status !== "building") continue;
    const site = await findSiteById(item.siteId);
    if (!site || site.status === "deploying") continue;
    const result: ItemResult = site.status === "deployed" ? "deployed" : "failed";
    // Re-read the latest rollout/items on each sweep pass? One stale pass is
    // fine — settleAndRefill's conditional updates make double-settles no-ops.
    await settleAndRefill(
      rollout,
      items,
      item,
      result,
      result === "failed" ? "resolvedBySweep" : null,
    );
    swept = true;
  }
  return swept;
}

/**
 * Core: settle one building item, persist the engine's outcome (streak,
 * breaker pause, finished), then refill free slots. `rollout` and `items` are
 * mutated in memory to stay consistent across the refill loop.
 */
async function settleAndRefill(
  rollout: Rollout,
  items: RolloutItem[],
  item: RolloutItem,
  result: ItemResult,
  error: string | null,
): Promise<void> {
  // Conditional settle: if the item already left `building` (double
  // resolution — callback AND reaper/sweep), this is a no-op.
  const settled = await settleBuildingItem(item.id, result, error);
  if (!settled) return;

  const outcome = applyItemResult(rollout, items, item.siteId, result);
  item.status = result;
  rollout.status = outcome.rolloutStatus;
  rollout.consecutiveFailures = outcome.consecutiveFailures;
  const terminal = outcome.rolloutStatus === "finished";
  await updateRollout(rollout.id, {
    status: outcome.rolloutStatus,
    consecutiveFailures: outcome.consecutiveFailures,
    ...(terminal ? { finishedAt: new Date() } : {}),
  });
  if (outcome.breakerTripped) {
    console.warn(
      `[rollout] ${rollout.id}: circuit breaker tripped after ` +
        `${outcome.consecutiveFailures} consecutive failures — paused`,
    );
  }

  await fillSlots(rollout, items);
}

/** Refill free build slots while the rollout is running. */
async function fillSlots(rollout: Rollout, items: RolloutItem[]): Promise<void> {
  while (rollout.status === "running") {
    const picks = nextDispatches(rollout, items);
    if (picks.length === 0) return;
    const next = items.find((i) => i.siteId === picks[0].siteId)!;

    const site = await findSiteById(next.siteId);
    let dispatchError: string | null = null;
    if (!site) {
      dispatchError = "notFound";
    } else if (!canStartDeploy(site)) {
      // Busy with a manual deploy — fail the item (retryable via retry-failed)
      // rather than stalling the queue behind it.
      dispatchError = "alreadyDeploying";
    }

    if (!dispatchError && site) {
      const claimed = await claimItemForBuild(next.id);
      if (!claimed) {
        // A concurrent runner took or cancelled it; reflect and move on.
        next.status = "building";
        continue;
      }
      next.status = "building";
      const res = await dispatchSiteDeploy(site, rollout.targetRef);
      if (res.ok) continue;
      dispatchError = res.error;
      // The dispatch already flipped the Site to `failed`; settle the item
      // through the engine so the breaker/finished logic sees it.
      const settled = await settleBuildingItem(next.id, "failed", dispatchError);
      if (!settled) continue;
      const outcome = applyItemResult(rollout, items, next.siteId, "failed");
      next.status = "failed";
      rollout.status = outcome.rolloutStatus;
      rollout.consecutiveFailures = outcome.consecutiveFailures;
      await updateRollout(rollout.id, {
        status: outcome.rolloutStatus,
        consecutiveFailures: outcome.consecutiveFailures,
        ...(outcome.rolloutStatus === "finished" ? { finishedAt: new Date() } : {}),
      });
      continue;
    }

    // Never built: mark failed and run it through the engine the same way.
    await failUnstartedItem(next.id, dispatchError ?? "unknown");
    const outcome = applyItemResult(rollout, items, next.siteId, "failed");
    next.status = "failed";
    rollout.status = outcome.rolloutStatus;
    rollout.consecutiveFailures = outcome.consecutiveFailures;
    await updateRollout(rollout.id, {
      status: outcome.rolloutStatus,
      consecutiveFailures: outcome.consecutiveFailures,
      ...(outcome.rolloutStatus === "finished" ? { finishedAt: new Date() } : {}),
    });
  }
}
