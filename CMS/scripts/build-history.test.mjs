/**
 * Pure tests for buildModelHistory — the transcript→model-history reconstructor.
 *
 * Guards the structured OpenAI/Claude tool round-trip: a pure tool-call assistant
 * turn becomes assistant{tool_calls} + role:"tool" results with MATCHING ids (the
 * pairing Claude and OpenAI both require), never an empty-content message.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildModelHistory } from "../src/lib/chat/build-history.ts";

test("tool-only assistant turn → structured assistant{tool_calls} + paired tool results", () => {
  const transcript = [
    { role: "user", content: "create a new section" },
    {
      role: "assistant",
      content: "",
      tools: [
        { id: "call_abc", name: "list_components", ok: true, input: {}, output: { components: ["Hero"] } },
      ],
    },
  ];
  const out = buildModelHistory(transcript, "continue");

  const assistant = out.find((m) => m.role === "assistant");
  assert.ok(assistant.tool_calls, "assistant carries structured tool_calls");
  assert.equal(assistant.tool_calls[0].id, "call_abc");
  assert.equal(assistant.tool_calls[0].type, "function");
  assert.equal(assistant.tool_calls[0].function.name, "list_components");
  assert.equal(assistant.tool_calls[0].function.arguments, "{}"); // JSON STRING, not object

  const toolMsg = out.find((m) => m.role === "tool");
  assert.equal(toolMsg.tool_call_id, "call_abc", "tool_call_id matches the assistant tool_calls id");
  assert.match(toolMsg.content, /Hero/, "tool result content carries the output");
  assert.equal(toolMsg.name, "list_components");

  assert.equal(out[out.length - 1].content, "continue");
});

test("every tool result id pairs with an assistant tool_calls id (no orphans)", () => {
  const out = buildModelHistory(
    [
      { role: "user", content: "x" },
      {
        role: "assistant",
        content: "",
        tools: [
          { id: "a", name: "list_pages", ok: true, output: {} },
          { id: "b", name: "list_components", ok: true, output: {} },
        ],
      },
    ],
    "go",
  );
  const callIds = new Set(out.flatMap((m) => m.tool_calls?.map((c) => c.id) ?? []));
  const toolMsgs = out.filter((m) => m.role === "tool");
  assert.equal(toolMsgs.length, 2);
  for (const tm of toolMsgs) assert.ok(callIds.has(tm.tool_call_id), `orphan tool_call_id ${tm.tool_call_id}`);
});

test("a card with no stored id gets a synthesized id (still paired)", () => {
  const out = buildModelHistory(
    [
      { role: "user", content: "x" },
      { role: "assistant", content: "", tools: [{ name: "get_theme", ok: true, output: {} }] },
    ],
    "next",
  );
  const assistant = out.find((m) => m.role === "assistant");
  const toolMsg = out.find((m) => m.role === "tool");
  const id = assistant.tool_calls[0].id;
  assert.notEqual(id, "");
  assert.equal(toolMsg.tool_call_id, id);
});

test("failed tool feeds back its errors, not output", () => {
  const out = buildModelHistory(
    [
      { role: "user", content: "x" },
      { role: "assistant", content: "", tools: [{ id: "c1", name: "create_page", ok: false, errors: ["unknown component Foo"] }] },
    ],
    "fix it",
  );
  const toolMsg = out.find((m) => m.role === "tool");
  assert.match(toolMsg.content, /unknown component Foo/);
});

test("plain assistant text turn stays as text (no tool_calls)", () => {
  const out = buildModelHistory(
    [
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello!", tools: [] },
    ],
    "more",
  );
  const assistant = out.find((m) => m.role === "assistant");
  assert.equal(assistant.content, "Hello!");
  assert.equal(assistant.tool_calls, undefined);
});

test("assistant turn with neither text nor tools is dropped", () => {
  const out = buildModelHistory(
    [
      { role: "user", content: "hello" },
      { role: "assistant", content: "", tools: [] },
    ],
    "continue",
  );
  assert.deepEqual(out, [
    { role: "user", content: "hello" },
    { role: "user", content: "continue" },
  ]);
});

test("arguments are always a JSON string (OpenAI tool shape), never an object", () => {
  const out = buildModelHistory(
    [
      { role: "user", content: "x" },
      { role: "assistant", content: "", tools: [{ id: "c", name: "create_page", ok: true, input: { slug: "home" }, output: {} }] },
    ],
    "go",
  );
  const call = out.find((m) => m.tool_calls)?.tool_calls[0];
  assert.equal(typeof call.function.arguments, "string");
  assert.deepEqual(JSON.parse(call.function.arguments), { slug: "home" });
});

test("array content (attachments) is appended as the final user turn verbatim", () => {
  const parts = [
    { type: "text", text: "what is this?" },
    { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
  ];
  const out = buildModelHistory([{ role: "user", content: "hi" }], parts);
  assert.deepEqual(out, [
    { role: "user", content: "hi" },
    { role: "user", content: parts },
  ]);
});

test("empty array content adds no turn", () => {
  const out = buildModelHistory([{ role: "user", content: "hi" }], []);
  assert.deepEqual(out, [{ role: "user", content: "hi" }]);
});
