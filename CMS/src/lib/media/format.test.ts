/**
 * Media-library pure helpers: byte formatting, lightbox cycling, page windows.
 * Run: node --test src/lib/media/format.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBytes, cycleIndex, pageWindow } from "./format.ts";

test("formatBytes: B / KB / MB with one decimal under 10", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(3.4 * 1024), "3.4 KB");
  assert.equal(formatBytes(42 * 1024), "42 KB");
  assert.equal(formatBytes(1.25 * 1024 * 1024), "1.3 MB");
  assert.equal(formatBytes(-1), "");
  assert.equal(formatBytes(Number.NaN), "");
});

test("cycleIndex wraps both directions; empty list → -1", () => {
  assert.equal(cycleIndex(0, 1, 5), 1);
  assert.equal(cycleIndex(4, 1, 5), 0);
  assert.equal(cycleIndex(0, -1, 5), 4);
  assert.equal(cycleIndex(0, 1, 0), -1);
});

test("pageWindow clamps the page and reports the 1-based item window", () => {
  assert.deepEqual(pageWindow(0, 24, 87), { page: 0, pageCount: 4, from: 1, to: 24 });
  assert.deepEqual(pageWindow(3, 24, 87), { page: 3, pageCount: 4, from: 73, to: 87 });
  // Past-the-end page (e.g. after deletes) clamps to the last page.
  assert.deepEqual(pageWindow(9, 24, 87), { page: 3, pageCount: 4, from: 73, to: 87 });
  assert.deepEqual(pageWindow(-2, 24, 87).page, 0);
  assert.deepEqual(pageWindow(0, 24, 0), { page: 0, pageCount: 1, from: 0, to: 0 });
});
