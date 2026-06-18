/**
 * Mocked-Ai-port test for the chat STREAMING consume/forward path
 * (binding-adapters subgoal — completes the Db+Storage+Ai trifecta).
 *
 * Db (page/settings/component/asset stores) and Storage (asset-store) are already
 * proven against mocked ports. The Ai port is the last unproven seam in a business
 * module. The adapter test (`ai-port.test.mjs`) only proves `CfAi` passes the
 * upstream stream THROUGH; this proves the CONSUMER — `reframe()` — correctly reads
 * a streamed OpenAI-compatible response from a FAKE `Ai` port and re-frames it.
 *
 * CRITICAL (per the task): exercise the STREAMING path. The fake Ai port returns a
 * multi-chunk `ReadableStream<Uint8Array>` deliberately split MID-LINE, so a green
 * test means reframe assembles tokens / parses tool calls ACROSS chunks — not just
 * a single buffered blob. Assertions are on the REAL re-framed client protocol
 * output (event names + parsed data), never "was-called" tautologies.
 *
 * Imports the REAL `reframe.ts` (+ real `sse.ts` it pulls in) via node
 * type-stripping; both are pure, no CF imports.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { reframe } from "../src/lib/chat/reframe.ts";
import { ToolCallAccumulator, frameEvent } from "../src/lib/chat/sse.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

/** An OpenAI-style streaming text-delta SSE line. */
const deltaLine = (text) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n`;

/** An OpenAI-style streaming tool-call fragment SSE line. */
const toolLine = (index, name, argsFragment) =>
  `data: ${JSON.stringify({
    choices: [{ delta: { tool_calls: [{ index, function: { name, arguments: argsFragment } }] } }],
  })}\n`;

/**
 * A FAKE `Ai` port: `chat()` returns a ReadableStream that emits the given byte
 * pieces one pull at a time, then [DONE], then closes. This is the
 * `Promise<ReadableStream<Uint8Array>>` shape the real `Ai.chat` returns — so
 * reframe consumes it exactly as it would the live binding's stream.
 */
function fakeAiStream(pieces) {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < pieces.length) {
        controller.enqueue(enc.encode(pieces[i++]));
      } else {
        controller.close();
      }
    },
  });
}

/** Drain a reframed stream into the array of parsed client-protocol events. */
async function drain(stream) {
  const reader = stream.getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
  }
  // Frames are `event: <name>\ndata: <json>\n\n`.
  return buf
    .split("\n\n")
    .filter((b) => b.trim() !== "")
    .map((frame) => {
      const [evLine, dataLine] = frame.split("\n");
      return {
        event: evLine.replace("event: ", ""),
        data: JSON.parse(dataLine.replace("data: ", "")),
      };
    });
}

// A no-op tool runner for the text-only cases (reframe never calls it then).
const noTools = async () => {
  throw new Error("runTools should not be called when there are no tool calls");
};

test("streams text deltas as token events across many chunks, then done", async () => {
  // Three separate SSE lines, each its own stream chunk → forwarded incrementally.
  const upstream = fakeAiStream([
    deltaLine("Hello"),
    deltaLine(", "),
    deltaLine("world"),
    "data: [DONE]\n",
  ]);

  const events = await drain(reframe(upstream, noTools));

  assert.deepEqual(
    events.map((e) => e.event),
    ["token", "token", "token", "done"],
  );
  // The actual assembled text — proving each delta was parsed & forwarded.
  assert.deepEqual(
    events.filter((e) => e.event === "token").map((e) => e.data.text),
    ["Hello", ", ", "world"],
  );
  assert.deepEqual(events.at(-1), { event: "done", data: {} });
});

test("reassembles a token whose SSE line is SPLIT across two stream chunks", async () => {
  // The headline streaming proof: one logical `data:` line arrives in two pieces,
  // the split landing mid-JSON. reframe must buffer across pull() calls.
  const line = deltaLine("streamed-token");
  const cut = Math.floor(line.length / 2);
  const upstream = fakeAiStream([line.slice(0, cut), line.slice(cut), "data: [DONE]\n"]);

  const events = await drain(reframe(upstream, noTools));

  assert.deepEqual(
    events.map((e) => e.event),
    ["token", "done"],
  );
  // If reframe had treated each chunk as a blob, the half-line JSON would fail to
  // parse and produce no token. A real "streamed-token" proves cross-chunk assembly.
  assert.equal(events[0].data.text, "streamed-token");
});

test("accumulates tool-call argument fragments across chunks and dispatches ONE assembled call", async () => {
  // The model streams `create_page`'s arguments as JSON-string fragments over many
  // chunks (real Workers AI behavior). reframe must collect them by index and hand
  // the runner ONE call with the concatenated+parsed args — not four partial calls.
  const upstream = fakeAiStream([
    toolLine(0, "create_page", '{"slug":'),
    toolLine(0, undefined, '"home",'),
    toolLine(0, undefined, '"title":'),
    toolLine(0, undefined, '"Home"}'),
    "data: [DONE]\n",
  ]);

  // Capture what reframe hands the injected runner — the assembled calls.
  let assembled;
  const runTools = async (tools, controller, encoder) => {
    assert.ok(tools instanceof ToolCallAccumulator);
    assembled = tools.finish();
    // Frame a `tool` result the way the real route does, so we also assert the
    // forwarded output, not just the internal handoff.
    controller.enqueue(
      encoder.encode(frameEvent("tool", { name: assembled[0].name, ok: true })),
    );
  };

  const events = await drain(reframe(upstream, runTools));

  // ONE fully-assembled call with parsed args (not 4 fragments, not a raw string).
  assert.equal(assembled.length, 1);
  assert.equal(assembled[0].name, "create_page");
  assert.deepEqual(assembled[0].args, { slug: "home", title: "Home" });

  // And the re-framed output: a tool event then done (no token events here).
  assert.deepEqual(
    events.map((e) => e.event),
    ["tool", "done"],
  );
  assert.deepEqual(events[0].data, { name: "create_page", ok: true });
});

test("interleaved text + tool call: tokens forwarded live, tool ran at stream end", async () => {
  const upstream = fakeAiStream([
    deltaLine("Creating page"),
    toolLine(0, "create_page", '{"slug":"about"}'),
    "data: [DONE]\n",
  ]);

  let assembled;
  const runTools = async (tools, controller, encoder) => {
    assembled = tools.finish();
    controller.enqueue(encoder.encode(frameEvent("tool", { name: assembled[0].name, ok: true })));
  };

  const events = await drain(reframe(upstream, runTools));

  // token streamed BEFORE the tool ran; tool then done at the end.
  assert.deepEqual(
    events.map((e) => e.event),
    ["token", "tool", "done"],
  );
  assert.equal(events[0].data.text, "Creating page");
  assert.deepEqual(assembled, [{ name: "create_page", args: { slug: "about" } }]);
});

test("a mid-stream read error frames an error event instead of done", async () => {
  const upstream = new ReadableStream({
    pull() {
      throw new Error("upstream exploded");
    },
  });

  const events = await drain(reframe(upstream, noTools));

  assert.equal(events.length, 1);
  assert.equal(events[0].event, "error");
  assert.equal(events[0].data.message, "upstream exploded");
});

test("tolerates keep-alive/blank lines in the stream without emitting tokens", async () => {
  const upstream = fakeAiStream([
    ": keep-alive\n",
    "\n",
    deltaLine("ok"),
    "data: [DONE]\n",
  ]);

  const events = await drain(reframe(upstream, noTools));

  assert.deepEqual(
    events.map((e) => e.event),
    ["token", "done"],
  );
  assert.equal(events[0].data.text, "ok");
});
