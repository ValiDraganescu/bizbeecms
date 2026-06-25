import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_BUILD_TIMEOUT_MIN,
  MAX_BUILD_TIMEOUT_MIN,
  coerceTimeoutMin,
  effectiveBuildTimeoutMin,
  effectiveBuildTimeoutSec,
} from "./build-timeout.ts";

test("coerceTimeoutMin accepts positive ints (clamped), rejects junk", () => {
  assert.equal(coerceTimeoutMin(10), 10);
  assert.equal(coerceTimeoutMin("15"), 15);
  assert.equal(coerceTimeoutMin(999), MAX_BUILD_TIMEOUT_MIN); // clamp up high
  assert.equal(coerceTimeoutMin(0), null);
  assert.equal(coerceTimeoutMin(-5), null);
  assert.equal(coerceTimeoutMin(1.5), null);
  assert.equal(coerceTimeoutMin("abc"), null);
  assert.equal(coerceTimeoutMin(null), null);
});

test("effective timeout is the LARGER of global and per-site", () => {
  assert.equal(effectiveBuildTimeoutMin(12, 30), 30); // site raises
  assert.equal(effectiveBuildTimeoutMin(30, 12), 30); // global floor wins
  assert.equal(effectiveBuildTimeoutMin(20, 20), 20);
});

test("per-site null/invalid falls back to global", () => {
  assert.equal(effectiveBuildTimeoutMin(15, null), 15);
  assert.equal(effectiveBuildTimeoutMin(15, 0), 15);
  assert.equal(effectiveBuildTimeoutMin(15, "x" as never), 15);
});

test("global unset defaults", () => {
  assert.equal(effectiveBuildTimeoutMin(null, null), DEFAULT_BUILD_TIMEOUT_MIN);
  assert.equal(effectiveBuildTimeoutMin(undefined, 20), 20); // site above default
  assert.equal(effectiveBuildTimeoutMin(null, 5), DEFAULT_BUILD_TIMEOUT_MIN); // site below default floor
});

test("seconds = minutes * 60", () => {
  assert.equal(effectiveBuildTimeoutSec(12, null), 720);
  assert.equal(effectiveBuildTimeoutSec(10, 25), 1500);
});
