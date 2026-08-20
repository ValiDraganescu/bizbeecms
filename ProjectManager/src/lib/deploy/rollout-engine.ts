/**
 * Rollout engine — pure state transitions for the D1-backed deploy queue
 * (fleet-deploy). No Cloudflare/db deps → runs under `node --test`. The routes
 * and the rollout runner persist what these functions decide; nothing here
 * does IO.
 *
 * Model: a rollout runs at most `parallelism` builds at once. A slot frees
 * when a Site's deploy resolves (deploy-callback or the reaper) and the next
 * `queued` item (by position) starts. Failures never block the queue — but
 * the circuit breaker pauses the rollout after `BREAKER_LIMIT` CONSECUTIVE
 * failures (a broken release shouldn't reach 200 sites); success resets the
 * streak, and resume clears it.
 */

import type { RolloutItemStatus, RolloutStatus } from "@/db/schema";

/** Deployer container `max_instances` — the hard infra ceiling on builds. */
export const MAX_PARALLELISM = 10;
export const MIN_PARALLELISM = 1;

/** Consecutive failures that trip the breaker (USER DECISION: 3). */
export const BREAKER_LIMIT = 3;

/** Coerce an operator-entered parallelism to an integer in 1..10, else null. */
export function clampParallelism(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return null;
  return Math.min(Math.max(n, MIN_PARALLELISM), MAX_PARALLELISM);
}

/** The minimal item shape the engine needs (matches RolloutItem). */
export type EngineItem = {
  siteId: string;
  status: RolloutItemStatus;
  position: number;
};

/** The minimal rollout shape the engine needs (matches Rollout). */
export type EngineRollout = {
  status: RolloutStatus;
  parallelism: number;
  consecutiveFailures: number;
};

/**
 * Which queued items should start now, strictly by position, given the number
 * of builds already in flight. Empty unless the rollout is `running`.
 */
export function nextDispatches(
  rollout: EngineRollout,
  items: EngineItem[],
): EngineItem[] {
  if (rollout.status !== "running") return [];
  const building = items.filter((i) => i.status === "building").length;
  const free = rollout.parallelism - building;
  if (free <= 0) return [];
  return items
    .filter((i) => i.status === "queued")
    .sort((a, b) => a.position - b.position)
    .slice(0, free);
}

export type ItemResult = "deployed" | "failed";

export type ApplyOutcome = {
  /** New status for the resolved item (mirrors `result`). */
  itemStatus: RolloutItemStatus;
  /** New consecutive-failure streak to persist on the rollout. */
  consecutiveFailures: number;
  /**
   * New rollout status: `paused` when the breaker trips, `finished` when no
   * queued/building work remains, else unchanged.
   */
  rolloutStatus: RolloutStatus;
  /** True when this resolution tripped the circuit breaker. */
  breakerTripped: boolean;
};

/**
 * Apply one Site's deploy resolution to the rollout. `items` must be the full
 * item list WITH the resolved site still in its pre-resolution `building`
 * state (the caller persists the returned statuses afterwards).
 */
export function applyItemResult(
  rollout: EngineRollout,
  items: EngineItem[],
  siteId: string,
  result: ItemResult,
): ApplyOutcome {
  const streak = result === "failed" ? rollout.consecutiveFailures + 1 : 0;
  const breakerTripped = result === "failed" && streak >= BREAKER_LIMIT;

  // Work left after this resolution: any other queued/building item.
  const remaining = items.some(
    (i) =>
      i.siteId !== siteId &&
      (i.status === "queued" || i.status === "building"),
  );

  let rolloutStatus: RolloutStatus = rollout.status;
  if (!remaining) {
    rolloutStatus = "finished";
  } else if (breakerTripped && rollout.status === "running") {
    rolloutStatus = "paused";
  }

  return {
    itemStatus: result,
    consecutiveFailures: streak,
    rolloutStatus,
    breakerTripped,
  };
}

export type RolloutCounts = {
  building: number;
  queued: number;
  deployed: number;
  failed: number;
  skipped: number;
  cancelled: number;
};

/** Per-status counts for the rollout card's badges. */
export function rolloutCounts(items: Pick<EngineItem, "status">[]): RolloutCounts {
  const counts: RolloutCounts = {
    building: 0,
    queued: 0,
    deployed: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
  };
  for (const item of items) counts[item.status] += 1;
  return counts;
}
