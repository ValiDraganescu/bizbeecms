/**
 * Tests for the parallel-get+update guard (chat tool round). Proves an
 * update_component issued in the SAME batch as get_component for the same
 * component is flagged to short-circuit (so its empty tree never reaches the
 * store), while legitimate combinations pass through untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { prematureUpdateIds } from "../src/lib/chat/premature-update.ts";

test("flags an update_component batched with get_component for the SAME name", () => {
  const calls = [
    { id: "a", name: "get_component", args: { name: "Hero" } },
    { id: "b", name: "update_component", args: { name: "Hero", tree: {} } },
  ];
  assert.deepEqual([...prematureUpdateIds(calls)], ["b"]);
});

test("does NOT flag an update when no get_component is in the batch (a normal edit)", () => {
  const calls = [
    { id: "b", name: "update_component", args: { name: "Hero", tree: { tag: "section" } } },
  ];
  assert.equal(prematureUpdateIds(calls).size, 0);
});

test("does NOT flag an update for a DIFFERENT component than the one being read", () => {
  const calls = [
    { id: "a", name: "get_component", args: { name: "Hero" } },
    { id: "b", name: "update_component", args: { name: "Footer", tree: { tag: "footer" } } },
  ];
  assert.equal(prematureUpdateIds(calls).size, 0);
});

test("flags only the matching update when several are batched", () => {
  const calls = [
    { id: "a", name: "get_component", args: { name: "Hero" } },
    { id: "b", name: "update_component", args: { name: "Hero", tree: {} } },
    { id: "c", name: "update_component", args: { name: "Footer", tree: { tag: "footer" } } },
  ];
  assert.deepEqual([...prematureUpdateIds(calls)], ["b"]);
});

test("tolerates malformed args (no name) without throwing", () => {
  const calls = [
    { id: "a", name: "get_component", args: null },
    { id: "b", name: "update_component", args: {} },
  ];
  assert.equal(prematureUpdateIds(calls).size, 0);
});
