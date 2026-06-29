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
  sanitizeMedia,
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

test("sanitizeTools caps the count at 50 (default) and honors a custom cap", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ name: "t", i }));
  assert.equal(sanitizeTools(many)?.length, 50);
  assert.equal(sanitizeTools(many, 120)?.length, 120);
});

test("parts (interleaved display order) persist on assistant turns, dropped on user turns", () => {
  const parts = [
    { kind: "text", text: "Created the Hero." },
    { kind: "tool", result: { name: "create_component", ok: true } },
  ];
  const v = validateThreadInput({
    messages: [
      { role: "assistant", content: "Created the Hero.", tools: [tool], parts },
      { role: "user", content: "thanks", parts },
    ],
  });
  assert.ok(v.ok);
  assert.deepEqual(v.input.messages[0].parts, parts, "assistant parts kept in order");
  assert.equal(v.input.messages[1].parts, undefined, "user-turn parts dropped");
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

const img = { name: "hero.jpg", url: "/media/abc123", mime: "image/jpeg" };

test("user media round-trips: validate → JSON column → parse", () => {
  const v = validateThreadInput({
    messages: [{ role: "user", content: "use this", media: [img] }],
  });
  assert.ok(v.ok);
  const column = JSON.stringify((v as { ok: true; input: { messages: unknown[] } }).input.messages);
  const loaded = parseStoredMessages(column);
  assert.deepEqual(loaded[0].media, [img]);
});

test("media only attaches to user turns (dropped on assistant)", () => {
  const v = validateThreadInput({
    messages: [{ role: "assistant", content: "hi", media: [img] }],
  });
  assert.ok(v.ok);
  assert.equal((v as { ok: true; input: { messages: { media?: unknown }[] } }).input.messages[0].media, undefined);
});

test("sanitizeMedia rejects unsafe url schemes, keeps relative/http/data:image", () => {
  const out = sanitizeMedia([
    { name: "ok-rel", url: "/media/x" },
    { name: "ok-http", url: "https://cdn/x.png" },
    { name: "ok-data", url: "data:image/png;base64,AAAA" },
    { name: "evil", url: "javascript:alert(1)" },
    { name: "evil2", url: "data:text/html,<script>" },
    { url: "/media/no-name" }, // missing name
    "nope", // not an object
  ]);
  assert.deepEqual(
    out?.map((m) => m.name),
    ["ok-rel", "ok-http", "ok-data"],
    "only safe-scheme, well-formed items survive",
  );
});

test("sanitizeMedia caps the count and ignores non-arrays", () => {
  assert.equal(sanitizeMedia("nope"), undefined);
  assert.equal(sanitizeMedia([]), undefined);
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `n${i}`, url: `/media/${i}` }));
  assert.equal(sanitizeMedia(many)?.length, 20);
});
