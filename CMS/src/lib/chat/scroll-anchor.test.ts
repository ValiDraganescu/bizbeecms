import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isAtBottom } from "./scroll-anchor.ts";

test("exactly at bottom", () => {
  assert.equal(isAtBottom({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 }), true);
});

test("within tolerance counts as bottom", () => {
  assert.equal(isAtBottom({ scrollTop: 780, scrollHeight: 1000, clientHeight: 200 }), true);
});

test("scrolled up beyond tolerance is not bottom", () => {
  assert.equal(isAtBottom({ scrollTop: 500, scrollHeight: 1000, clientHeight: 200 }), false);
});

test("non-scrollable content is always bottom", () => {
  assert.equal(isAtBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 200 }), true);
});

test("custom tolerance", () => {
  assert.equal(isAtBottom({ scrollTop: 700, scrollHeight: 1000, clientHeight: 200 }, 100), true);
  assert.equal(isAtBottom({ scrollTop: 700, scrollHeight: 1000, clientHeight: 200 }, 50), false);
});
