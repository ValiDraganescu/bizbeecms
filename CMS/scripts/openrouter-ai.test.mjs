/**
 * Tests for the `OpenRouterAi` adapter (ai-openrouter goal — tracer slice).
 * Dep-free node --test; imports the REAL .ts adapter via native type-stripping.
 *
 * We drive the real adapter against a FAKE `fetch` (no live key, no network) and
 * assert what OpenRouter actually RECEIVES — the chat-completions URL, the Bearer
 * auth header, the OpenAI-compatible `{ model, messages, stream: true, tools }`
 * JSON body — plus that the adapter PASSES THROUGH `response.body` (the SSE byte
 * stream) UNCHANGED (no buffering). Those are the contracts callers depend on.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { OpenRouterAi, OPENROUTER_CHAT_URL } from "../src/lib/ports/ai.ts";

/** Fake fetch: records the call, returns a controllable response. */
function fakeFetch({ ok = true, status = 200, body = new ReadableStream() } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, body };
  };
  fn.calls = calls;
  return fn;
}

test("chat POSTs to OpenRouter with Bearer auth + OpenAI-compatible streaming body", async () => {
  const sentinel = new ReadableStream();
  const f = fakeFetch({ body: sentinel });
  const ai = new OpenRouterAi("sk-or-test", f);
  const messages = [
    { role: "system", content: "be brief" },
    { role: "user", content: "hi" },
  ];
  const tools = [{ type: "function", function: { name: "t" } }];

  const stream = await ai.chat(messages, {
    model: "openai/gpt-4o-mini",
    tools,
    gatewayId: "ignored-for-openrouter",
  });

  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.equal(url, OPENROUTER_CHAT_URL);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer sk-or-test");
  assert.equal(init.headers["Content-Type"], "application/json");

  const sent = JSON.parse(init.body);
  assert.equal(sent.model, "openai/gpt-4o-mini");
  assert.equal(sent.stream, true);
  assert.deepEqual(sent.messages, messages);
  assert.deepEqual(sent.tools, tools);

  // Upstream stream returned as-is — NOT buffered/consumed.
  assert.equal(stream, sentinel);
});

test("chat omits tools when not provided", async () => {
  const f = fakeFetch();
  const ai = new OpenRouterAi("sk-or-test", f);

  await ai.chat([{ role: "user", content: "x" }], { model: "m" });

  const sent = JSON.parse(f.calls[0].init.body);
  assert.equal(sent.stream, true);
  assert.ok(!("tools" in sent), "tools must be absent when not requested");
});

test("chat throws on non-ok response (so the route surfaces it, not a silent stream)", async () => {
  const f = fakeFetch({ ok: false, status: 401, body: null });
  const ai = new OpenRouterAi("bad-key", f);

  await assert.rejects(
    () => ai.chat([{ role: "user", content: "x" }], { model: "m" }),
    /HTTP 401/,
  );
});

test("chat throws when the response has no body", async () => {
  const f = fakeFetch({ ok: true, status: 200, body: null });
  const ai = new OpenRouterAi("sk-or-test", f);

  await assert.rejects(
    () => ai.chat([{ role: "user", content: "x" }], { model: "m" }),
    /no body/,
  );
});
