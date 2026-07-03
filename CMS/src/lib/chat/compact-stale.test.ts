/**
 * ai-context-engineering — stale-thread compaction. Guards the user's hard
 * constraint: a <24h thread is returned byte-identical (same reference), a
 * >24h thread gets oversized tool outputs stubbed, error cards keep their
 * error shape, and `parts` (UI cards) are never touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compactStaleThreadMessages, STALE_THREAD_MS } from "./compact-stale.ts";
import { buildModelHistory } from "./build-history.ts";

const NOW = 1_800_000_000_000;
const bigOutput = { pages: Array.from({ length: 100 }, (_, i) => ({ slug: `page-${i}`, title: `Page ${i}` })) };

function makeMessages() {
  return [
    { role: "user", content: "show me the pages" },
    {
      role: "assistant",
      content: "Here they are.",
      tools: [
        { id: "call_1", name: "list_pages", ok: true, input: {}, output: bigOutput },
        { id: "call_2", name: "get_page", ok: false, input: { slug: "nope" }, errors: ["page not found: nope"] },
        { id: "call_3", name: "set_title", ok: true, input: { title: "x" }, output: { ok: true } },
      ],
      parts: [
        { kind: "tool", result: { id: "call_1", name: "list_pages", ok: true, input: {}, output: bigOutput } },
        { kind: "text", text: "Here they are." },
      ],
    },
  ];
}

test("fresh thread (<24h) is returned unchanged, by reference", () => {
  const messages = makeMessages();
  const out = compactStaleThreadMessages(messages, NOW - STALE_THREAD_MS + 60_000, NOW);
  assert.equal(out, messages); // same reference — provider cache prefix untouched
  assert.equal(JSON.stringify(out), JSON.stringify(makeMessages())); // and byte-identical
});

test("stale thread (>24h) stubs oversized successful outputs", () => {
  const out = compactStaleThreadMessages(makeMessages(), NOW - STALE_THREAD_MS - 60_000, NOW);
  const tools = (out[1] as { tools: Record<string, unknown>[] }).tools;
  const stubbed = tools[0].output as string;
  assert.equal(typeof stubbed, "string");
  assert.match(stubbed, /^\[list_pages result, \d+\.\dkB — elided/);
  assert.match(stubbed, /call the tool again/);
});

test("stale thread: error cards keep their exact error shape", () => {
  const out = compactStaleThreadMessages(makeMessages(), NOW - STALE_THREAD_MS - 60_000, NOW);
  const tools = (out[1] as { tools: Record<string, unknown>[] }).tools;
  assert.deepEqual(tools[1], {
    id: "call_2",
    name: "get_page",
    ok: false,
    input: { slug: "nope" },
    errors: ["page not found: nope"],
  });
});

test("stale thread: small outputs and parts (UI cards) are untouched", () => {
  const fresh = makeMessages();
  const out = compactStaleThreadMessages(makeMessages(), NOW - STALE_THREAD_MS - 60_000, NOW);
  const msg = out[1] as { tools: Record<string, unknown>[]; parts: unknown[] };
  assert.deepEqual(msg.tools[2], fresh[1].tools![2]); // tiny {ok:true} output kept
  assert.deepEqual(msg.parts, fresh[1].parts); // UI cards still show the full result
});

test("compacted history replays the stub, not the payload", () => {
  const out = compactStaleThreadMessages(makeMessages(), NOW - STALE_THREAD_MS - 60_000, NOW);
  const history = buildModelHistory(out as never, "next question");
  const toolMsg = history.find((m) => m.role === "tool" && m.tool_call_id === "call_1")!;
  assert.match(toolMsg.content as string, /elided from history/);
  assert.ok((toolMsg.content as string).length < 200);
  // error result still replays its error JSON
  const errMsg = history.find((m) => m.role === "tool" && m.tool_call_id === "call_2")!;
  assert.match(errMsg.content as string, /page not found/);
});

test("garbage updatedAt is treated as fresh (never compact on bad data)", () => {
  const messages = makeMessages();
  assert.equal(compactStaleThreadMessages(messages, NaN, NOW), messages);
});
