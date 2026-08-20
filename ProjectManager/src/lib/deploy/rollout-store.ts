import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type {
  NewRollout,
  NewRolloutItem,
  Rollout,
  RolloutItem,
  RolloutItemStatus,
  RolloutStatus,
} from "@/db/schema";

/**
 * D1 access for rollouts (fleet-deploy). Plain queries only — every decision
 * (slot math, breaker, finished detection) lives in the pure rollout-engine;
 * the runner composes the two.
 *
 * The two conditional updates (`claimItemForBuild`, `settleBuildingItem`) are
 * the concurrency guard: two overlapping resolutions (callback + reaper, or
 * two different sites' callbacks) race benignly because an item can only move
 * queued→building and building→terminal ONCE — the second writer's UPDATE
 * matches zero rows and it backs off.
 */

/** The at-most-one rollout currently running or paused. */
export async function findActiveRollout(): Promise<Rollout | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.rollouts)
    .where(inArray(schema.rollouts.status, ["running", "paused"]))
    .orderBy(desc(schema.rollouts.startedAt))
    .limit(1);
  return row ?? null;
}

/** The newest rollout of any status — the card also shows finished/stopped. */
export async function findLatestRollout(): Promise<Rollout | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.rollouts)
    .orderBy(desc(schema.rollouts.startedAt))
    .limit(1);
  return row ?? null;
}

export async function findRolloutById(id: string): Promise<Rollout | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.rollouts)
    .where(eq(schema.rollouts.id, id))
    .limit(1);
  return row ?? null;
}

/** All items of a rollout, in queue order. */
export async function listRolloutItems(
  rolloutId: string,
): Promise<RolloutItem[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.rolloutItems)
    .where(eq(schema.rolloutItems.rolloutId, rolloutId))
    .orderBy(schema.rolloutItems.position);
}

export async function createRollout(
  rollout: NewRollout,
  items: NewRolloutItem[],
): Promise<void> {
  const db = await getDb();
  await db.insert(schema.rollouts).values(rollout);
  if (items.length > 0) await db.insert(schema.rolloutItems).values(items);
}

export async function updateRollout(
  id: string,
  set: Partial<{
    status: RolloutStatus;
    consecutiveFailures: number;
    finishedAt: Date | null;
  }>,
): Promise<void> {
  const db = await getDb();
  await db.update(schema.rollouts).set(set).where(eq(schema.rollouts.id, id));
}

/**
 * Atomically claim a queued item for building. False = someone else already
 * moved it (or it was cancelled) — the caller skips it.
 */
export async function claimItemForBuild(itemId: string): Promise<boolean> {
  const db = await getDb();
  const claimed = await db
    .update(schema.rolloutItems)
    .set({ status: "building", startedAt: new Date() })
    .where(
      and(
        eq(schema.rolloutItems.id, itemId),
        eq(schema.rolloutItems.status, "queued"),
      ),
    )
    .returning({ id: schema.rolloutItems.id });
  return claimed.length > 0;
}

/**
 * Atomically settle a building item to a terminal status. False = it wasn't
 * `building` anymore (double resolution — callback AND reaper) — back off.
 */
export async function settleBuildingItem(
  itemId: string,
  status: Extract<RolloutItemStatus, "deployed" | "failed">,
  error: string | null,
): Promise<boolean> {
  const db = await getDb();
  const settled = await db
    .update(schema.rolloutItems)
    .set({ status, error, finishedAt: new Date() })
    .where(
      and(
        eq(schema.rolloutItems.id, itemId),
        eq(schema.rolloutItems.status, "building"),
      ),
    )
    .returning({ id: schema.rolloutItems.id });
  return settled.length > 0;
}

/** Mark an item failed before it ever built (dispatch failure, site gone). */
export async function failUnstartedItem(
  itemId: string,
  error: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .update(schema.rolloutItems)
    .set({ status: "failed", error, startedAt: now, finishedAt: now })
    .where(eq(schema.rolloutItems.id, itemId));
}

/** Stop: every still-queued item is cancelled (building ones settle via cancel). */
export async function cancelQueuedItems(rolloutId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.rolloutItems)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(
      and(
        eq(schema.rolloutItems.rolloutId, rolloutId),
        eq(schema.rolloutItems.status, "queued"),
      ),
    );
}

/** Settle a building item as cancelled (rollout stop killed its container). */
export async function cancelBuildingItem(itemId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.rolloutItems)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(
      and(
        eq(schema.rolloutItems.id, itemId),
        eq(schema.rolloutItems.status, "building"),
      ),
    );
}
