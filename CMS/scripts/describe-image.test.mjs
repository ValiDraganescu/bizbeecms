/**
 * Dep-free tests for the image-description helper (searchable media).
 * Run: node --test scripts/describe-image.test.mjs
 *
 * The live OpenRouter call is HITL; here we test the pure prompt-build +
 * response-parse + the failure-is-empty contract (upload must never fail over a
 * bad describe), using an injected fake fetch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDescribeMessages,
  parseDescription,
  describeImage,
  MAX_DESCRIPTION_CHARS,
} from "../src/lib/chat/describe-image.ts";

test("buildDescribeMessages embeds the image as an image_url part", () => {
  const msgs = buildDescribeMessages("data:image/png;base64,AAA");
  assert.equal(msgs.length, 2);
  const userParts = msgs[1].content;
  const img = userParts.find((p) => p.type === "image_url");
  assert.equal(img.image_url.url, "data:image/png;base64,AAA");
  assert.ok(userParts.some((p) => p.type === "text"));
});

test("parseDescription pulls assistant text and collapses whitespace", () => {
  const body = JSON.stringify({
    choices: [{ message: { content: "An  astronaut\nfloating in space." } }],
  });
  assert.equal(parseDescription(body), "An astronaut floating in space.");
});

test("parseDescription handles array content parts", () => {
  const body = JSON.stringify({
    choices: [{ message: { content: [{ type: "text", text: "Red logo" }, { foo: 1 }] } }],
  });
  assert.equal(parseDescription(body), "Red logo");
});

test("parseDescription bounds the length", () => {
  const long = "x ".repeat(1000);
  const body = JSON.stringify({ choices: [{ message: { content: long } }] });
  assert.ok(parseDescription(body).length <= MAX_DESCRIPTION_CHARS);
});

test("parseDescription returns '' on garbage / unexpected shape", () => {
  assert.equal(parseDescription("not json"), "");
  assert.equal(parseDescription(JSON.stringify({ choices: [] })), "");
  assert.equal(parseDescription(JSON.stringify({})), "");
});

test("describeImage returns the parsed text on a 200", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ choices: [{ message: { content: "A blue mug on a desk." } }] }),
  });
  const out = await describeImage("data:image/png;base64,AAA", "vendor/model", "k", fakeFetch);
  assert.deepEqual(out, { description: "A blue mug on a desk." });
});

test("describeImage surfaces usage.cost for metering and asks for it", async () => {
  let sentBody;
  const fakeFetch = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "A cat." } }],
          usage: { prompt_tokens: 900, completion_tokens: 12, cost: 0.00042 },
        }),
    };
  };
  const out = await describeImage("u", "vendor/model", "k", fakeFetch);
  assert.deepEqual(out, { description: "A cat.", cost: 0.00042 });
  assert.deepEqual(sentBody.usage, { include: true });
  // Reasoning is switched OFF for alt text — a thinking model would otherwise
  // burn the 300-token cap on chain-of-thought and return nothing.
  assert.deepEqual(sentBody.reasoning, { enabled: false });
  assert.equal(sentBody.max_tokens, 300);
});

test("describeImage retries ONCE with minimal effort + a bigger cap when reasoning is mandatory", async () => {
  const bodies = [];
  const fakeFetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) {
      return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: "Reasoning is mandatory for this endpoint and cannot be disabled.", code: 400 } }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: "A gold logo." } }], usage: { cost: 0.001 } }) };
  };
  const out = await describeImage("u", "x-ai/grok-4.6", "k", fakeFetch);
  assert.deepEqual(out, { description: "A gold logo.", cost: 0.001 });
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0].reasoning, { enabled: false });
  assert.deepEqual(bodies[1].reasoning, { effort: "minimal" });
  assert.equal(bodies[1].max_tokens, 1200);
});

test("describeImage does NOT retry on other 400s (one request, empty result)", async () => {
  let calls = 0;
  const fakeFetch = async () => { calls += 1; return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: "invalid image" } }) }; };
  assert.deepEqual(await describeImage("u", "m", "k", fakeFetch), { description: "" });
  assert.equal(calls, 1);
});

test("describeImage returns no description/cost on a non-ok response (upload must still succeed)", async () => {
  const fakeFetch = async () => ({ ok: false, status: 402, text: async () => "no credits" });
  assert.deepEqual(await describeImage("u", "m", "k", fakeFetch), { description: "" });
});

test("describeImage returns no description when key or model is missing (no call made)", async () => {
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return { ok: true, status: 200, text: async () => "{}" };
  };
  assert.deepEqual(await describeImage("u", "m", "", fakeFetch), { description: "" });
  assert.deepEqual(await describeImage("u", "", "k", fakeFetch), { description: "" });
  assert.equal(called, false, "no HTTP call without key+model");
});

test("describeImage swallows a thrown fetch (network error → empty result)", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };
  assert.deepEqual(await describeImage("u", "m", "k", fakeFetch), { description: "" });
});
