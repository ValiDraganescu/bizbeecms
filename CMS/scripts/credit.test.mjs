/**
 * ai-openrouter: pure OpenRouter per-KEY credit parse/format helpers.
 * Dep-free, imports the .ts source directly under Node type-stripping.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseKeyCredit,
  formatUsd,
  OPENROUTER_KEY_URL,
} from "../src/lib/chat/credit.ts";

test("parseKeyCredit: capped key → usage/limit/remaining", () => {
  const c = parseKeyCredit({ data: { usage: 2.5, limit: 10 } });
  assert.deepEqual(c, { usage: 2.5, limit: 10, remaining: 7.5 });
});

test("parseKeyCredit: uncapped key (limit null) → remaining null", () => {
  const c = parseKeyCredit({ data: { usage: 3, limit: null } });
  assert.deepEqual(c, { usage: 3, limit: null, remaining: null });
});

test("parseKeyCredit: limit absent → uncapped", () => {
  const c = parseKeyCredit({ data: { usage: 0 } });
  assert.deepEqual(c, { usage: 0, limit: null, remaining: null });
});

test("parseKeyCredit: numeric strings are coerced", () => {
  const c = parseKeyCredit({ data: { usage: "1.25", limit: "5" } });
  assert.deepEqual(c, { usage: 1.25, limit: 5, remaining: 3.75 });
});

test("parseKeyCredit: usage > limit clamps remaining at 0", () => {
  const c = parseKeyCredit({ data: { usage: 12, limit: 10 } });
  assert.equal(c.remaining, 0);
});

test("parseKeyCredit: missing/garbage → null", () => {
  assert.equal(parseKeyCredit(null), null);
  assert.equal(parseKeyCredit({}), null);
  assert.equal(parseKeyCredit({ data: {} }), null); // no usage
  assert.equal(parseKeyCredit({ data: { usage: "nope" } }), null);
  assert.equal(parseKeyCredit("string"), null);
});

test("formatUsd: 2 decimals", () => {
  assert.equal(formatUsd(1.5), "1.50");
  assert.equal(formatUsd(0), "0.00");
  assert.equal(formatUsd(7.5), "7.50");
});

test("OPENROUTER_KEY_URL is the per-key endpoint (not /credits)", () => {
  assert.equal(OPENROUTER_KEY_URL, "https://openrouter.ai/api/v1/key");
});
