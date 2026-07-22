/**
 * Tests for the multi-turn tool loop `streamChatRounds` (ai-assistant goal —
 * tool-call round-tripping). Proves the model's tool RESULTS are fed back so it can
 * chain (discover → act), bounded by maxRounds, with the right client protocol out.
 *
 * Fakes the `Ai` port the same way reframe.test.mjs does: each turn is a
 * ReadableStream of OpenAI-style SSE pieces. `nextTurn` returns the next scripted
 * turn and CAPTURES the transcript so we can assert tool results were fed back.
 *
 * Imports the REAL reframe.ts via node type-stripping (pure, no CF imports).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { streamChatRounds } from "../src/lib/chat/reframe.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

const deltaLine = (text) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n`;
const toolLine = (index, name, argsFragment, id) =>
  `data: ${JSON.stringify({
    choices: [{ delta: { tool_calls: [{ index, ...(id ? { id } : {}), function: { name, arguments: argsFragment } }] } }],
  })}\n`;

function turnStream(pieces) {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < pieces.length) controller.enqueue(enc.encode(pieces[i++]));
      else controller.close();
    },
  });
}

async function drain(stream) {
  const reader = stream.getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
  }
  return buf
    .split("\n\n")
    .filter((b) => b.trim() !== "")
    .map((frame) => {
      const [evLine, dataLine] = frame.split("\n");
      return { event: evLine.replace("event: ", ""), data: JSON.parse(dataLine.replace("data: ", "")) };
    });
}

/** A runTools that frames each call's result and returns structured results. */
const runToolsRound = async (calls, controller, encoder) => {
  return calls.map((c) => {
    const data = { name: c.name, ok: true, echo: c.args };
    controller.enqueue(encoder.encode(`event: tool\ndata: ${JSON.stringify(data)}\n\n`));
    return { name: c.name, data };
  });
};

test("a turn with NO tool call ends immediately (token… done) — single round", async () => {
  const initial = turnStream([deltaLine("Hi there"), "data: [DONE]\n"]);
  const nextTurn = async () => {
    throw new Error("should not ask a second turn when no tools were called");
  };
  const events = await drain(streamChatRounds(initial, [], nextTurn, runToolsRound));
  assert.deepEqual(events.map((e) => e.event), ["token", "done"]);
  assert.equal(events[0].data.text, "Hi there");
});

test("tool result is FED BACK: round 1 calls a tool, round 2 sees it and answers", async () => {
  // Round 1: model lists components (tool), no final text yet.
  const round1 = turnStream([
    deltaLine("Let me look"),
    toolLine(0, "list_components", "{}"),
    "data: [DONE]\n",
  ]);
  // Round 2: model produces the final answer (no tools).
  const round2 = turnStream([deltaLine("You have 2 components."), "data: [DONE]\n"]);

  let fedTranscript;
  const nextTurn = async (messages) => {
    fedTranscript = messages;
    return round2;
  };

  const events = await drain(streamChatRounds(round1, [{ role: "user", content: "what components?" }], nextTurn, runToolsRound));

  // Client protocol: round-1 token, the tool event, round-2 token, ONE done.
  assert.deepEqual(events.map((e) => e.event), ["token", "tool", "token", "done"]);
  assert.equal(events[0].data.text, "Let me look");
  assert.equal(events[1].data.name, "list_components");
  assert.equal(events[2].data.text, "You have 2 components.");

  // The follow-up turn's transcript must include the assistant tool_calls + the
  // tool result message — that's the round-tripping proof.
  const assistantTurn = fedTranscript.find((m) => m.role === "assistant" && m.tool_calls);
  assert.ok(assistantTurn, "synthesized assistant tool_calls message fed back");
  assert.equal(assistantTurn.tool_calls[0].function.name, "list_components");
  const toolMsg = fedTranscript.find((m) => m.role === "tool");
  assert.ok(toolMsg, "tool result message fed back");
  assert.equal(toolMsg.tool_call_id, assistantTurn.tool_calls[0].id);
  assert.equal(JSON.parse(toolMsg.content).name, "list_components");
});

test("the PROVIDER's real tool-call id round-trips (assistant tool_calls ↔ tool_call_id)", async () => {
  // Round 1 streams a tool call WITH the provider's own id (e.g. Claude/OpenAI emit one).
  const round1 = turnStream([toolLine(0, "list_pages", "{}", "toolu_real_42"), "data: [DONE]\n"]);
  const round2 = turnStream([deltaLine("done"), "data: [DONE]\n"]);
  let fed;
  const nextTurn = async (messages) => {
    fed = messages;
    return round2;
  };
  await drain(streamChatRounds(round1, [], nextTurn, runToolsRound));

  const assistantTurn = fed.find((m) => m.role === "assistant" && m.tool_calls);
  assert.equal(assistantTurn.tool_calls[0].id, "toolu_real_42", "provider id preserved, not re-synthesized");
  const toolMsg = fed.find((m) => m.role === "tool");
  assert.equal(toolMsg.tool_call_id, "toolu_real_42", "tool result references the provider id");
});

test("maxRounds caps a runaway loop: tools run each round but no infinite follow-up", async () => {
  // Every turn calls a tool forever; the loop must stop at maxRounds and emit done.
  const makeToolTurn = () => turnStream([toolLine(0, "create_page", '{"slug":"x"}'), "data: [DONE]\n"]);
  let asks = 0;
  const nextTurn = async () => {
    asks++;
    return makeToolTurn();
  };
  const events = await drain(streamChatRounds(makeToolTurn(), [], nextTurn, runToolsRound, 3));

  // 3 rounds → 3 tool events, then done. nextTurn asked only twice (rounds 2 & 3);
  // the 3rd round runs tools but does NOT ask a 4th turn.
  assert.equal(events.filter((e) => e.event === "tool").length, 3);
  assert.equal(events.at(-1).event, "done");
  assert.equal(asks, 2);
});

test("after a FAILED tool the model goes silent → loop nudges it once to retry", async () => {
  // Round 1: model calls update_component; it FAILS. Round 2: model says nothing
  // (the Grok stop-on-error). The loop must inject a retry nudge and ask round 3,
  // where the model finally succeeds — instead of ending on the error.
  const failingTools = async (calls, controller, encoder) =>
    calls.map((c) => {
      const data = { name: c.name, ok: false, errors: ["tree is empty"] };
      controller.enqueue(encoder.encode(`event: tool\ndata: ${JSON.stringify(data)}\n\n`));
      return { name: c.name, data };
    });

  const round1 = turnStream([toolLine(0, "update_component", '{"name":"Hero","tree":{}}'), "data: [DONE]\n"]);
  const round2silent = turnStream(["data: [DONE]\n"]); // empty turn, no text/tools
  const round3 = turnStream([deltaLine("Fixed it."), "data: [DONE]\n"]);

  const turns = [round2silent, round3];
  const fed = [];
  const nextTurn = async (messages) => {
    fed.push([...messages]);
    return turns.shift();
  };

  const events = await drain(streamChatRounds(round1, [], nextTurn, failingTools));
  // The final answer arrives — the loop did NOT stop on the silent error turn.
  assert.ok(events.some((e) => e.event === "token" && e.data.text === "Fixed it."));
  assert.equal(events.at(-1).event, "done");
  // A user-role nudge referencing the failure was injected before round 3.
  const lastTranscript = fed.at(-1);
  const nudge = lastTranscript.find((m) => m.role === "user" && /tool call just failed/i.test(m.content));
  assert.ok(nudge, "a retry nudge was appended after the silent failure");
});

test("a SUCCESSFUL tool then a silent turn ends normally (no spurious nudge)", async () => {
  const round1 = turnStream([toolLine(0, "list_pages", "{}"), "data: [DONE]\n"]);
  const round2silent = turnStream(["data: [DONE]\n"]);
  const nextTurn = async () => round2silent;
  const events = await drain(streamChatRounds(round1, [], nextTurn, runToolsRound));
  // runToolsRound returns ok:true → no failure → silent turn is a legit end.
  assert.equal(events.at(-1).event, "done");
  assert.equal(events.filter((e) => e.event === "token").length, 0);
});

test("onComplete fires once before done with the FULL transcript + final text", async () => {
  // Round 1 calls a tool; round 2 is the final answer. onComplete must receive the
  // whole gateway transcript (system + user + assistant tool_calls + tool result +
  // final assistant answer) and the final text.
  const round1 = turnStream([toolLine(0, "list_pages", "{}", "call_1"), "data: [DONE]\n"]);
  const round2 = turnStream([deltaLine("All done."), "data: [DONE]\n"]);
  const nextTurn = async () => round2;

  let seenTranscript;
  let seenFinal;
  let calls = 0;
  const onComplete = (transcript, finalText) => {
    calls++;
    seenTranscript = transcript;
    seenFinal = finalText;
  };

  const initialMessages = [
    { role: "system", content: "sys" },
    { role: "user", content: "hi" },
  ];
  const events = await drain(
    streamChatRounds(round1, initialMessages, nextTurn, runToolsRound, 4, undefined, onComplete),
  );

  assert.equal(calls, 1, "onComplete fires exactly once");
  assert.equal(events.at(-1).event, "done");
  assert.equal(seenFinal, "All done.");
  const roles = seenTranscript.map((m) => m.role);
  assert.deepEqual(roles, ["system", "user", "assistant", "tool", "assistant"]);
  // The final assistant answer is appended verbatim.
  assert.equal(seenTranscript.at(-1).content, "All done.");
  // The tool-call round is present with the provider id round-tripped.
  const toolCallTurn = seenTranscript.find((m) => m.role === "assistant" && m.tool_calls);
  assert.equal(toolCallTurn.tool_calls[0].id, "call_1");
});

test("a throwing onComplete never breaks the stream (still emits done)", async () => {
  const initial = turnStream([deltaLine("hi"), "data: [DONE]\n"]);
  const nextTurn = async () => { throw new Error("no second turn"); };
  const events = await drain(
    streamChatRounds(initial, [], nextTurn, runToolsRound, 4, undefined, () => {
      throw new Error("observer boom");
    }),
  );
  assert.equal(events.at(-1).event, "done");
});

test("a mid-stream upstream error frames an error event, not done", async () => {
  const boom = new ReadableStream({ pull() { throw new Error("upstream exploded"); } });
  const nextTurn = async () => boom;
  const events = await drain(streamChatRounds(boom, [], nextTurn, runToolsRound));
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "error");
  assert.equal(events[0].data.message, "upstream exploded");
});
