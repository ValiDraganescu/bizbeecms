/**
 * Tests for the `Ai` port + `CfAi` adapter (binding-adapters subgoal).
 * Dep-free node --test; imports the REAL .ts adapter via native type-stripping
 * (`getAi` imports `@opennextjs/cloudflare` but only invokes it when called, so
 * importing the module under node is fine).
 *
 * We drive the real `CfAi` against a fake `env.AI` binding and assert what the
 * binding actually RECEIVES — the model, the OpenAI-compatible `{ messages,
 * stream: true, tools }` inputs, the `{ gateway: { id } }` options — plus that the
 * adapter PASSES THROUGH the upstream ReadableStream unchanged (no buffering).
 * Those are the contracts that would break callers if the seam regressed:
 * collapsing `stream` to non-streaming, or dropping tools/gateway, or buffering.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { CfAi } from "../src/lib/ports/ai.ts";

/** Fake env.AI binding: records the run() call, returns a sentinel stream. */
function fakeAi(returnStream) {
  const calls = [];
  return {
    calls,
    async run(model, inputs, options) {
      calls.push({ model, inputs, options });
      return returnStream;
    },
  };
}

test("chat calls run with the model + OpenAI-compatible streaming inputs + gateway", async () => {
  const sentinel = new ReadableStream();
  const binding = fakeAi(sentinel);
  const ai = new CfAi(binding);
  const messages = [
    { role: "system", content: "be brief" },
    { role: "user", content: "hi" },
  ];
  const tools = [{ type: "function", function: { name: "t" } }];

  const stream = await ai.chat(messages, {
    model: "@cf/meta/llama-3.1-8b-instruct",
    tools,
    gatewayId: "bizbeecms-cms",
  });

  assert.equal(binding.calls.length, 1);
  const call = binding.calls[0];
  assert.equal(call.model, "@cf/meta/llama-3.1-8b-instruct");
  // The headline contract: streaming preserved, messages + tools passed through.
  assert.equal(call.inputs.stream, true);
  assert.deepEqual(call.inputs.messages, messages);
  assert.deepEqual(call.inputs.tools, tools);
  assert.deepEqual(call.options, { gateway: { id: "bizbeecms-cms" } });
  // And the upstream stream is returned as-is — NOT buffered/consumed.
  assert.equal(stream, sentinel);
});

test("chat omits tools and gateway options when not provided", async () => {
  const binding = fakeAi(new ReadableStream());
  const ai = new CfAi(binding);

  await ai.chat([{ role: "user", content: "x" }], {
    model: "m",
  });

  const { inputs, options } = binding.calls[0];
  assert.equal(inputs.stream, true);
  assert.ok(!("tools" in inputs), "tools must be absent when not requested");
  assert.equal(options, undefined, "no gateway option when no gatewayId");
});
