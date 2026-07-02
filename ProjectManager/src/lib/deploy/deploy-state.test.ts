import assert from "node:assert/strict";
import { test } from "node:test";

// Pure module — no drizzle/env — so it runs under `node --test` (relative path
// for node's resolver, not the `@/` alias).
import {
  STUCK_AFTER_MS,
  REAP_GRACE_MS,
  isDeployStuck,
  canStartDeploy,
  shouldReapDeploy,
} from "./deploy-state.ts";

const NOW = 1_000_000_000_000;
const site = (status: string, startedMsAgo?: number) => ({
  status,
  deployStartedAt:
    startedMsAgo === undefined ? null : new Date(NOW - startedMsAgo),
});

test("non-deploying statuses are never stuck", () => {
  for (const s of ["draft", "deployed", "failed"]) {
    assert.equal(isDeployStuck(site(s, 0) as never, NOW), false);
  }
});

test("a fresh deploy is not stuck; a too-old one is", () => {
  assert.equal(isDeployStuck(site("deploying", 1000) as never, NOW), false);
  assert.equal(
    isDeployStuck(site("deploying", STUCK_AFTER_MS + 1) as never, NOW),
    true,
  );
});

test("a deploying site with no start stamp is treated as stuck (recoverable)", () => {
  assert.equal(isDeployStuck(site("deploying") as never, NOW), true);
});

test("shouldReapDeploy fires only past timeout+grace, on deploying rows with a start stamp", () => {
  const TIMEOUT_MIN = 15;
  const capMs = TIMEOUT_MIN * 60_000 + REAP_GRACE_MS;
  // within the window → not reaped
  assert.equal(
    shouldReapDeploy(site("deploying", capMs - 1) as never, TIMEOUT_MIN, NOW),
    false,
  );
  // past timeout + grace → reaped
  assert.equal(
    shouldReapDeploy(site("deploying", capMs + 1) as never, TIMEOUT_MIN, NOW),
    true,
  );
  // non-deploying rows are never reaped, however old
  assert.equal(
    shouldReapDeploy(site("failed", capMs + 1) as never, TIMEOUT_MIN, NOW),
    false,
  );
  // unknown age (no start stamp) is NOT auto-failed — manual restart covers it
  assert.equal(shouldReapDeploy(site("deploying") as never, TIMEOUT_MIN, NOW), false);
});

test("canStartDeploy allows clean states and stale deploys, blocks a live one", () => {
  assert.equal(canStartDeploy(site("draft", 0) as never, NOW), true);
  assert.equal(canStartDeploy(site("failed", 0) as never, NOW), true);
  // live, recent deploy → blocked
  assert.equal(canStartDeploy(site("deploying", 1000) as never, NOW), false);
  // stale deploy → restart allowed
  assert.equal(
    canStartDeploy(site("deploying", STUCK_AFTER_MS + 1) as never, NOW),
    true,
  );
});
