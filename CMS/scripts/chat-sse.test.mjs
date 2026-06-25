/**
 * Dep-free unit tests for the pure SSE plumbing of the CMS AI chat endpoint
 * (Milestone 2, epic B1). Run: node --test scripts/chat-sse.test.mjs
 *
 * Imports the TS module directly via Node native type-stripping (project
 * convention; sse.ts is pure — no CF/React/network imports).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SseDeltaParser,
  parseLine,
  extractDelta,
  frameEvent,
  parseChatBody,
} from "../src/lib/chat/sse.ts";

const chunk = (text) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`;

// ── parseLine ──────────────────────────────────────────────────────────────
test("parseLine: text delta line → delta event", () => {
  assert.deepEqual(parseLine(chunk("Hello")), { type: "delta", text: "Hello" });
});

test("parseLine: [DONE] sentinel → done event", () => {
  assert.deepEqual(parseLine("data: [DONE]"), { type: "done" });
});

test("parseLine: tolerates missing space after data:", () => {
  assert.deepEqual(parseLine("data:[DONE]"), { type: "done" });
});

test("parseLine: blank/comment/non-data lines → null", () => {
  assert.equal(parseLine(""), null);
  assert.equal(parseLine(": keep-alive"), null);
  assert.equal(parseLine("event: foo"), null);
});

test("parseLine: unparseable JSON → null (no throw)", () => {
  assert.equal(parseLine("data: {not json"), null);
});

test("parseLine: role-only / empty-content delta → null", () => {
  assert.equal(
    parseLine(`data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}`),
    null,
  );
  assert.equal(parseLine(chunk("")), null);
});

// ── extractDelta ─────────────────────────────────────────────────────────────
test("extractDelta: pulls content string", () => {
  assert.equal(extractDelta({ choices: [{ delta: { content: "hi" } }] }), "hi");
});

test("extractDelta: usage-only / malformed chunks → null", () => {
  assert.equal(extractDelta({ usage: { prompt_tokens: 5 } }), null);
  assert.equal(extractDelta({ choices: [] }), null);
  assert.equal(extractDelta(null), null);
  assert.equal(extractDelta("nope"), null);
});

// ── SseDeltaParser (incremental, cross-chunk) ────────────────────────────────
test("parser: collects deltas then done across whole lines", () => {
  const p = new SseDeltaParser();
  const evs = [
    ...p.push(chunk("Hel") + "\n" + chunk("lo") + "\n"),
    ...p.push("data: [DONE]\n"),
  ];
  assert.deepEqual(evs, [
    { type: "delta", text: "Hel" },
    { type: "delta", text: "lo" },
    { type: "done" },
  ]);
});

test("parser: a line split across two pushes is buffered until complete", () => {
  const p = new SseDeltaParser();
  const line = chunk("split");
  const mid = Math.floor(line.length / 2);
  assert.deepEqual(p.push(line.slice(0, mid)), []); // partial → nothing yet
  assert.deepEqual(p.push(line.slice(mid) + "\n"), [{ type: "delta", text: "split" }]);
});

test("parser: flush drains a final newline-less line", () => {
  const p = new SseDeltaParser();
  assert.deepEqual(p.push(chunk("end")), []); // no trailing \n → buffered
  assert.deepEqual(p.flush(), [{ type: "delta", text: "end" }]);
});

// ── frameEvent ────────────────────────────────────────────────────────────────
test("frameEvent: produces a well-formed SSE frame", () => {
  assert.equal(
    frameEvent("token", { text: "hi" }),
    'event: token\ndata: {"text":"hi"}\n\n',
  );
  assert.equal(frameEvent("done", {}), "event: done\ndata: {}\n\n");
});

// ── parseChatBody ─────────────────────────────────────────────────────────────
test("parseChatBody: accepts a valid message list", () => {
  const r = parseChatBody({ messages: [{ role: "user", content: "hi" }] });
  assert.deepEqual(r, { messages: [{ role: "user", content: "hi" }] });
});

test("parseChatBody: rejects non-object / missing / empty messages", () => {
  assert.ok("error" in parseChatBody(null));
  assert.ok("error" in parseChatBody({}));
  assert.ok("error" in parseChatBody({ messages: [] }));
  assert.ok("error" in parseChatBody({ messages: "nope" }));
});

test("parseChatBody: rejects bad role / empty content", () => {
  assert.ok("error" in parseChatBody({ messages: [{ role: "bot", content: "x" }] }));
  assert.ok("error" in parseChatBody({ messages: [{ role: "user", content: "  " }] }));
  assert.ok("error" in parseChatBody({ messages: [{ role: "user", content: 42 }] }));
});

// ── structured tool protocol (OpenAI/Claude round-trip) ───────────────────────
test("parseChatBody: an assistant tool_calls turn may have EMPTY content", () => {
  const r = parseChatBody({
    messages: [
      { role: "user", content: "create a section" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", type: "function", function: { name: "list_pages", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "c1", name: "list_pages", content: '{"pages":[]}' },
      { role: "user", content: "continue" },
    ],
  });
  assert.ok("messages" in r, "structured turn accepted (no empty-content 400)");
  const assistant = r.messages.find((m) => m.role === "assistant");
  assert.equal(assistant.tool_calls[0].id, "c1");
  assert.equal(assistant.tool_calls[0].function.arguments, "{}"); // JSON string preserved
  const tool = r.messages.find((m) => m.role === "tool");
  assert.equal(tool.tool_call_id, "c1");
});

test("parseChatBody: a plain assistant turn with empty content + no tool_calls is still rejected", () => {
  assert.ok("error" in parseChatBody({ messages: [{ role: "assistant", content: "" }] }));
  assert.ok("error" in parseChatBody({ messages: [{ role: "assistant", content: "  " }] }));
});

test("parseChatBody: a tool message without tool_call_id is rejected", () => {
  assert.ok("error" in parseChatBody({ messages: [{ role: "tool", content: "{}" }] }));
});

test("parseChatBody: malformed tool_calls (missing id/name) is rejected as empty content", () => {
  // tool_calls present but invalid → not treated as a valid tool turn → empty content fails.
  const r = parseChatBody({
    messages: [{ role: "assistant", content: "", tool_calls: [{ type: "function", function: { name: "x", arguments: "{}" } }] }],
  });
  assert.ok("error" in r);
});
