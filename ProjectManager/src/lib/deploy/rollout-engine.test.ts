import assert from "node:assert/strict";
import { test } from "node:test";

// Pure module — type-only schema imports strip under node, so this runs under
// `node --test` (relative path for node's resolver, not the `@/` alias).
import {
  BREAKER_LIMIT,
  MAX_PARALLELISM,
  applyItemResult,
  clampParallelism,
  nextDispatches,
  rolloutCounts,
  type EngineItem,
  type EngineRollout,
} from "./rollout-engine.ts";

const rollout = (over: Partial<EngineRollout> = {}): EngineRollout => ({
  status: "running",
  parallelism: 2,
  consecutiveFailures: 0,
  ...over,
});

const item = (
  siteId: string,
  status: EngineItem["status"],
  position: number,
): EngineItem => ({ siteId, status, position });

test("clampParallelism coerces to an integer in 1..10", () => {
  assert.equal(clampParallelism(3), 3);
  assert.equal(clampParallelism("5"), 5);
  assert.equal(clampParallelism(0), null);
  assert.equal(clampParallelism(-2), null);
  assert.equal(clampParallelism(2.5), null);
  assert.equal(clampParallelism("junk"), null);
  assert.equal(clampParallelism(99), MAX_PARALLELISM);
});

test("nextDispatches fills free slots strictly by position", () => {
  const items = [
    item("c", "queued", 3),
    item("a", "queued", 1),
    item("b", "queued", 2),
  ];
  const picked = nextDispatches(rollout({ parallelism: 2 }), items);
  assert.deepEqual(picked.map((i) => i.siteId), ["a", "b"]);
});

test("nextDispatches subtracts builds already in flight", () => {
  const items = [
    item("a", "building", 1),
    item("b", "queued", 2),
    item("c", "queued", 3),
  ];
  const picked = nextDispatches(rollout({ parallelism: 2 }), items);
  assert.deepEqual(picked.map((i) => i.siteId), ["b"]);
});

test("nextDispatches returns nothing when slots are full or queue is empty", () => {
  const full = [item("a", "building", 1), item("b", "building", 2), item("c", "queued", 3)];
  assert.deepEqual(nextDispatches(rollout({ parallelism: 2 }), full), []);
  const drained = [item("a", "deployed", 1), item("b", "failed", 2)];
  assert.deepEqual(nextDispatches(rollout({ parallelism: 2 }), drained), []);
});

test("nextDispatches handles parallelism larger than the queue", () => {
  const items = [item("a", "queued", 1), item("b", "queued", 2)];
  const picked = nextDispatches(rollout({ parallelism: 10 }), items);
  assert.deepEqual(picked.map((i) => i.siteId), ["a", "b"]);
});

test("paused/stopped/finished rollouts dispatch nothing", () => {
  const items = [item("a", "queued", 1)];
  for (const status of ["paused", "stopped", "finished"] as const) {
    assert.deepEqual(nextDispatches(rollout({ status }), items), []);
  }
});

test("a success resets the consecutive-failure streak", () => {
  const items = [item("a", "building", 1), item("b", "queued", 2)];
  const out = applyItemResult(
    rollout({ consecutiveFailures: BREAKER_LIMIT - 1 }),
    items,
    "a",
    "deployed",
  );
  assert.equal(out.itemStatus, "deployed");
  assert.equal(out.consecutiveFailures, 0);
  assert.equal(out.rolloutStatus, "running");
  assert.equal(out.breakerTripped, false);
});

test("the breaker trips at exactly BREAKER_LIMIT consecutive failures", () => {
  const items = [item("a", "building", 1), item("b", "queued", 2)];
  const below = applyItemResult(
    rollout({ consecutiveFailures: BREAKER_LIMIT - 2 }),
    items,
    "a",
    "failed",
  );
  assert.equal(below.breakerTripped, false);
  assert.equal(below.rolloutStatus, "running");
  assert.equal(below.consecutiveFailures, BREAKER_LIMIT - 1);

  const at = applyItemResult(
    rollout({ consecutiveFailures: BREAKER_LIMIT - 1 }),
    items,
    "a",
    "failed",
  );
  assert.equal(at.breakerTripped, true);
  assert.equal(at.rolloutStatus, "paused");
  assert.equal(at.consecutiveFailures, BREAKER_LIMIT);
});

test("interleaved failures don't trip the breaker — consecutive, not total", () => {
  const items = [item("a", "building", 1), item("b", "queued", 2)];
  // fail, success (streak reset), fail, fail — never reaches 3 in a row.
  let streak = 0;
  for (const result of ["failed", "deployed", "failed", "failed"] as const) {
    const out = applyItemResult(
      rollout({ consecutiveFailures: streak }),
      items,
      "a",
      result,
    );
    streak = out.consecutiveFailures;
    assert.equal(out.breakerTripped, false);
  }
  assert.equal(streak, 2);
});

test("the last resolution finishes the rollout (even a failure)", () => {
  const items = [item("a", "building", 1), item("b", "deployed", 2)];
  const out = applyItemResult(rollout(), items, "a", "failed");
  assert.equal(out.rolloutStatus, "finished");
});

test("finished wins over the breaker when nothing is left to protect", () => {
  const items = [item("a", "building", 1)];
  const out = applyItemResult(
    rollout({ consecutiveFailures: BREAKER_LIMIT - 1 }),
    items,
    "a",
    "failed",
  );
  assert.equal(out.breakerTripped, true);
  assert.equal(out.rolloutStatus, "finished");
});

test("skipped/cancelled items don't keep a rollout alive", () => {
  const items = [
    item("a", "building", 1),
    item("b", "skipped", 2),
    item("c", "cancelled", 3),
  ];
  const out = applyItemResult(rollout(), items, "a", "deployed");
  assert.equal(out.rolloutStatus, "finished");
});

test("a paused rollout finishing its in-flight builds can finish", () => {
  // Breaker tripped earlier; the final running build resolves while paused and
  // no queued work remains → the rollout is done, not stuck in paused.
  const items = [item("a", "building", 1), item("b", "failed", 2)];
  const out = applyItemResult(rollout({ status: "paused" }), items, "a", "failed");
  assert.equal(out.rolloutStatus, "finished");
});

test("a paused rollout with queued work stays paused on late resolutions", () => {
  const items = [item("a", "building", 1), item("b", "queued", 2)];
  const out = applyItemResult(rollout({ status: "paused" }), items, "a", "failed");
  assert.equal(out.rolloutStatus, "paused");
});

test("rolloutCounts tallies every status", () => {
  const counts = rolloutCounts([
    item("a", "building", 1),
    item("b", "building", 2),
    item("c", "queued", 3),
    item("d", "deployed", 4),
    item("e", "failed", 5),
    item("f", "skipped", 6),
    item("g", "cancelled", 7),
  ]);
  assert.deepEqual(counts, {
    building: 2,
    queued: 1,
    deployed: 1,
    failed: 1,
    skipped: 1,
    cancelled: 1,
  });
});
