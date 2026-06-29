/**
 * Streaming reassembly of PARALLEL tool calls — the bug behind "the model sent
 * empty args". A model that fans out several tool calls can pack more than one
 * into a single SSE delta's `tool_calls[]` (each at its own `index`). The old
 * `parseLine`/`extractToolCall` read only `tool_calls[0]`, so the other calls'
 * args (or the calls themselves) were dropped → the handler saw `{}`. These pin
 * that ALL entries survive and reassemble by index.
 *
 * Relative `.ts` import — `node --test` can't resolve the `@/` alias (CAVEATS).
 * Run: npx tsc --noEmit && node --test src/lib/chat/sse-toolcalls.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SseDeltaParser, ToolCallAccumulator } from "./sse.ts";

/** Feed raw SSE text through the parser → accumulator → finished calls. */
function run(sse: string) {
  const parser = new SseDeltaParser();
  const acc = new ToolCallAccumulator();
  for (const ev of [...parser.push(sse), ...parser.flush()]) {
    if (ev.type === "tool_call") acc.add(ev);
  }
  return acc.finish();
}

test("TWO parallel calls in ONE delta both survive (not just tool_calls[0])", () => {
  // Opening delta carries BOTH call shells; args stream in later per-index deltas.
  const sse =
    `data: ${JSON.stringify({
      choices: [{ delta: { tool_calls: [
        { index: 0, id: "A", function: { name: "set_block_props", arguments: "" } },
        { index: 1, id: "B", function: { name: "set_block_props", arguments: "" } },
      ] } }],
    })}\n\n` +
    `data: ${JSON.stringify({
      choices: [{ delta: { tool_calls: [
        { index: 0, function: { arguments: '{"blockId":"Hero-1","props":{"title":"Hi"}}' } },
      ] } }],
    })}\n\n` +
    `data: ${JSON.stringify({
      choices: [{ delta: { tool_calls: [
        { index: 1, function: { arguments: '{"blockId":"List-1","props":{"limit":3}}' } },
      ] } }],
    })}\n\n`;

  const calls = run(sse);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    id: "A",
    name: "set_block_props",
    args: { blockId: "Hero-1", props: { title: "Hi" } },
  });
  assert.deepEqual(calls[1], {
    id: "B",
    name: "set_block_props",
    args: { blockId: "List-1", props: { limit: 3 } },
  });
});

test("args for non-zero-index calls aren't lost when batched in a multi-entry delta", () => {
  // The regression shape: a SINGLE delta holds the full args for BOTH calls at
  // once. The old code only read [0], so call index 1's args vanished → `{}`.
  const sse = `data: ${JSON.stringify({
    choices: [{ delta: { tool_calls: [
      { index: 0, id: "A", function: { name: "edit_text", arguments: '{"target":"a"}' } },
      { index: 1, id: "B", function: { name: "edit_text", arguments: '{"target":"b"}' } },
    ] } }],
  })}\n\n`;

  const calls = run(sse);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args, { target: "b" }); // would be {} before the fix
});

test("a single tool call still reassembles across arg fragments", () => {
  const sse =
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "A", function: { name: "set_block_props", arguments: '{"block' } }] } }] })}\n\n` +
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'Id":"x"}' } }] } }] })}\n\n`;
  const calls = run(sse);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, { blockId: "x" });
});
