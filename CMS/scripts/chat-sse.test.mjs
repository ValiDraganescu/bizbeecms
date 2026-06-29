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

test("parseLine: provider error chunk → error event with the full message", () => {
  // xAI/Grok streams `data: {"error":{"code":7003,"message":"..."}}` on input
  // rejection. Before the error branch this returned null and the reason was lost.
  const line = `data: ${JSON.stringify({
    error: { code: 7003, message: "User Input Error: image url must be absolute" },
  })}`;
  assert.deepEqual(parseLine(line), {
    type: "error",
    message: "7003: User Input Error: image url must be absolute",
  });
});

test("parseLine: error chunk appends metadata when present", () => {
  const line = `data: ${JSON.stringify({
    error: { message: "bad request", metadata: { provider: "xai", raw: "details" } },
  })}`;
  const ev = parseLine(line);
  assert.equal(ev.type, "error");
  assert.match(ev.message, /^bad request \(.*xai.*\)$/);
});

test("parseLine: error chunk with no message → generic 'upstream error'", () => {
  const line = `data: ${JSON.stringify({ error: { code: 500 } })}`;
  assert.deepEqual(parseLine(line), { type: "error", message: "500: upstream error" });
});

test("parseLine: a usage chunk → usage event with token counts", () => {
  // With stream_options.include_usage, the provider emits a final chunk carrying
  // usage (often with empty choices). It must surface, not be dropped as "no delta".
  const line = `data: ${JSON.stringify({
    choices: [],
    usage: { prompt_tokens: 1200, completion_tokens: 340, total_tokens: 1540 },
  })}`;
  assert.deepEqual(parseLine(line), {
    type: "usage",
    promptTokens: 1200,
    completionTokens: 340,
    totalTokens: 1540,
  });
});

test("parseLine: usage with only prompt/completion derives total", () => {
  const line = `data: ${JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 5 } })}`;
  assert.deepEqual(parseLine(line), {
    type: "usage",
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
  });
});

test("parseLine: usage:null or all-zero usage → null (nothing to report)", () => {
  assert.equal(parseLine(`data: ${JSON.stringify({ usage: null })}`), null);
  assert.equal(
    parseLine(`data: ${JSON.stringify({ usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } })}`),
    null,
  );
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

// ── parseChatBody: attachment content arrays (ai-attachments) ────────────────
test("parseChatBody: a user content ARRAY of text + image parts is accepted", () => {
  const content = [
    { type: "text", text: "what is this?" },
    { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
  ];
  const r = parseChatBody({ messages: [{ role: "user", content }] });
  assert.ok(!("error" in r));
  assert.deepEqual(r.messages[0].content, content);
});

test("parseChatBody: a file content part round-trips", () => {
  const content = [
    { type: "file", file: { filename: "a.pdf", file_data: "data:application/pdf;base64,JVBE" } },
  ];
  const r = parseChatBody({ messages: [{ role: "user", content }] });
  assert.ok(!("error" in r));
  assert.deepEqual(r.messages[0].content, content);
});

test("parseChatBody: malformed / empty content arrays are rejected", () => {
  assert.ok("error" in parseChatBody({ messages: [{ role: "user", content: [] }] }));
  assert.ok("error" in parseChatBody({ messages: [{ role: "user", content: [{ type: "nope" }] }] }));
  assert.ok("error" in parseChatBody({ messages: [{ role: "user", content: [{ type: "image_url", image_url: {} }] }] }));
  // assistant content arrays aren't supported (only user attachments)
  assert.ok("error" in parseChatBody({ messages: [{ role: "assistant", content: [{ type: "text", text: "x" }] }] }));
});
