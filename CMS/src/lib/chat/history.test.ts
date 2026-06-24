/**
 * Round-trip tests for chat-history persistence — focused on the ai-widget-ux
 * task "persist tool calls in chat history": an assistant turn's `tools` must
 * survive validate (save) → JSON column → parse (load) unchanged, while garbage
 * is dropped and bounds hold. Runs under `node --test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateThreadInput,
  parseStoredMessages,
  sanitizeTools,
} from "./history.ts";

const tool = {
  name: "create_component",
  ok: true,
  action: "created",
  component: "Hero",
  input: { name: "Hero", tree: { type: "div" } },
  output: { name: "create_component", ok: true, component: "Hero" },
};

test("tool calls round-trip: save (validate) → JSON column → load (parse)", () => {
  const body = {
    messages: [
      { role: "user", content: "build a hero" },
      { role: "assistant", content: "done", tools: [tool] },
    ],
  };
  const v = validateThreadInput(body);
  assert.ok(v.ok, "input should validate");
  // The store serializes input.messages wholesale into the JSON column.
  const column = JSON.stringify(v.input.messages);
  const loaded = parseStoredMessages(column);

  assert.equal(loaded.length, 2);
  assert.deepEqual(loaded[1].tools, [tool], "assistant tools survive the round-trip incl. input/output");
  assert.equal(loaded[0].tools, undefined, "user turns carry no tools");
});

test("tools only attach to assistant turns", () => {
  const v = validateThreadInput({
    messages: [{ role: "user", content: "hi", tools: [tool] }],
  });
  assert.ok(v.ok);
  assert.equal(v.input.messages[0].tools, undefined, "user-turn tools are dropped");
});

test("sanitizeTools drops non-object entries and non-arrays", () => {
  assert.equal(sanitizeTools("nope"), undefined);
  assert.equal(sanitizeTools(undefined), undefined);
  assert.equal(sanitizeTools([]), undefined);
  assert.deepEqual(sanitizeTools([tool, 1, null, "x", [tool]]), [tool], "only plain objects kept");
});

test("sanitizeTools caps the count at 50", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ name: "t", i }));
  assert.equal(sanitizeTools(many)?.length, 50);
});

test("parseStoredMessages tolerates a turn with garbage tools (drops them, keeps text)", () => {
  const column = JSON.stringify([
    { role: "assistant", content: "hi", tools: "garbage" },
  ]);
  const loaded = parseStoredMessages(column);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].content, "hi");
  assert.equal(loaded[0].tools, undefined);
});

test("legacy threads (no tools field) still load fine", () => {
  const column = JSON.stringify([
    { role: "user", content: "old" },
    { role: "assistant", content: "reply" },
  ]);
  const loaded = parseStoredMessages(column);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[1].tools, undefined);
});
