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

import { readFileSync } from "node:fs";
import { CfAi, DEFAULT_AI_GATEWAY } from "../src/lib/ports/ai.ts";

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

// Regression guard for BUG P1 (2026-06-19): the default gateway slug + the
// wrangler AI_GATEWAY var must name the AI Gateway that ACTUALLY exists on the
// account. A mismatch makes `env.AI.run` fail with `2001: Please configure AI
// Gateway` on EVERY chat message. The runtime call can't be exercised offline,
// so we pin the slug here and assert code + config agree.
const ACCOUNT_AI_GATEWAY = "bizbeecms-ai-gateway";

test("default AI Gateway slug matches the gateway on the account", () => {
  assert.equal(
    DEFAULT_AI_GATEWAY,
    ACCOUNT_AI_GATEWAY,
    "ai.ts DEFAULT_AI_GATEWAY must name a real account gateway (else error 2001)",
  );
});

test("wrangler.jsonc AI_GATEWAY var matches the default gateway slug", () => {
  const wrangler = readFileSync(
    new URL("../wrangler.jsonc", import.meta.url),
    "utf8",
  );
  const m = wrangler.match(/"AI_GATEWAY":\s*"([^"]+)"/);
  assert.ok(m, "AI_GATEWAY var must be present in wrangler.jsonc");
  assert.equal(
    m[1],
    ACCOUNT_AI_GATEWAY,
    "wrangler.jsonc AI_GATEWAY must match the real account gateway",
  );
});
