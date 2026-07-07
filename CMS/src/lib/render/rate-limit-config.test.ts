/**
 * rate-limit-config — per-site naughty-robot rate-limit preset (seo-robots 2/2).
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RATE_LIMIT_PRESETS,
  DEFAULT_RATE_LIMIT_PRESET,
  STRICT_LIMIT,
  normalizeRateLimitPreset,
  usesBindingLimiter,
  strictCounterOverLimit,
} from "./rate-limit-config.ts";

test("presets are exactly off/normal/strict, default is normal", () => {
  assert.deepEqual([...RATE_LIMIT_PRESETS], ["off", "normal", "strict"]);
  assert.equal(DEFAULT_RATE_LIMIT_PRESET, "normal");
});

test("normalize accepts valid presets, defaults everything else to normal", () => {
  assert.equal(normalizeRateLimitPreset("off"), "off");
  assert.equal(normalizeRateLimitPreset("normal"), "normal");
  assert.equal(normalizeRateLimitPreset("strict"), "strict");
  for (const bad of ["", "OFF", "loose", 5, null, undefined, {}, ["strict"]]) {
    assert.equal(normalizeRateLimitPreset(bad), "normal", `bad input ${JSON.stringify(bad)}`);
  }
});

test("only off skips the binding limiter", () => {
  assert.equal(usesBindingLimiter("off"), false);
  assert.equal(usesBindingLimiter("normal"), true);
  assert.equal(usesBindingLimiter("strict"), true);
});

test("strict counter allows up to the limit, then trips over it", () => {
  const store = new Map<string, number[]>();
  const now = 1_000_000;
  // First STRICT_LIMIT hits in the window are all allowed (not over).
  for (let i = 0; i < STRICT_LIMIT; i++) {
    assert.equal(strictCounterOverLimit(store, "1.2.3.4", now), false, `hit ${i}`);
  }
  // The next hit pushes count to STRICT_LIMIT+1 → over the limit.
  assert.equal(strictCounterOverLimit(store, "1.2.3.4", now), true);
});

test("strict counter is per-key — one hot IP doesn't trip another", () => {
  const store = new Map<string, number[]>();
  const now = 2_000_000;
  for (let i = 0; i <= STRICT_LIMIT; i++) strictCounterOverLimit(store, "hot", now);
  assert.equal(strictCounterOverLimit(store, "hot", now), true);
  assert.equal(strictCounterOverLimit(store, "cool", now), false);
});

test("strict counter forgets hits older than the window (sliding)", () => {
  const store = new Map<string, number[]>();
  const t0 = 3_000_000;
  // Fill to the cap at t0.
  for (let i = 0; i < STRICT_LIMIT; i++) strictCounterOverLimit(store, "ip", t0);
  // A hit 61s later — all prior hits expired, so this lone hit is under the cap.
  assert.equal(strictCounterOverLimit(store, "ip", t0 + 61_000), false);
});
