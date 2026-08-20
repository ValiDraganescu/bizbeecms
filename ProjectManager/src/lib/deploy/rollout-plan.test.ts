import assert from "node:assert/strict";
import { test } from "node:test";

// Pure module — no drizzle/env — so it runs under `node --test` (relative path
// for node's resolver, not the `@/` alias).
import {
  planRolloutItem,
  planSkipReason,
  planWillDeploy,
} from "./rollout-plan.ts";

test("never-deployed sites install", () => {
  assert.equal(planRolloutItem(null, "3.2.0"), "install");
  assert.equal(planRolloutItem(undefined, "3.2.0"), "install");
  assert.equal(planRolloutItem("", "3.2.0"), "install");
});

test("older tagged versions upgrade (r-* and legacy cms-v*)", () => {
  assert.equal(planRolloutItem("r-3.1.0", "3.2.0"), "upgrade");
  assert.equal(planRolloutItem("r-3.0.4", "3.2.0"), "upgrade");
  assert.equal(planRolloutItem("cms-v0.6.0", "3.2.0"), "upgrade");
});

test("the exact target version is skipped as up to date", () => {
  assert.equal(planRolloutItem("r-3.2.0", "3.2.0"), "skip_up_to_date");
  assert.equal(planRolloutItem("cms-v3.2.0", "3.2.0"), "skip_up_to_date");
});

test("newer tagged versions are skipped — downgrades are blocked", () => {
  assert.equal(planRolloutItem("r-3.2.0", "3.1.2"), "skip_newer");
  assert.equal(planRolloutItem("r-4.0.0", "3.9.9"), "skip_newer");
  // Semver compare, not string compare: 3.10.0 > 3.9.0.
  assert.equal(planRolloutItem("r-3.10.0", "3.9.0"), "skip_newer");
});

test("main and untagged refs move onto any tagged release", () => {
  assert.equal(planRolloutItem("main", "3.2.0"), "move_to_tag");
  assert.equal(planRolloutItem("some/branch", "0.0.1"), "move_to_tag");
});

test("planWillDeploy covers exactly the dispatching actions", () => {
  assert.equal(planWillDeploy("install"), true);
  assert.equal(planWillDeploy("upgrade"), true);
  assert.equal(planWillDeploy("move_to_tag"), true);
  assert.equal(planWillDeploy("skip_up_to_date"), false);
  assert.equal(planWillDeploy("skip_newer"), false);
});

test("planSkipReason maps skips to their persisted reason", () => {
  assert.equal(planSkipReason("skip_up_to_date"), "up_to_date");
  assert.equal(planSkipReason("skip_newer"), "newer");
  assert.equal(planSkipReason("upgrade"), null);
  assert.equal(planSkipReason("install"), null);
});
