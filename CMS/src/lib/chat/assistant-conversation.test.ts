/**
 * assistant-conversations — pure-half tests. Guards the caching contract (the
 * stored gateway transcript is replayed VERBATIM with only the new user turn
 * appended), the desync fallbacks (a stale/failed store must never resurrect a
 * different conversation), the untrusted conversationId gate, and the persisted
 * payload assembly (system dropped, `at` stamped, context carried, size-capped).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASSISTANT_AGENT_ID,
  parseAssistantConversationId,
  rehydrateAssistantHistory,
  buildAssistantPayload,
} from "./assistant-conversation.ts";
import { MAX_PAYLOAD_BYTES } from "../public-chat/core.ts";

/* ------------------------------------------------- parseAssistantConversationId */

test("accepts a widget UUID and a legacy thread id", () => {
  const uuid = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
  assert.equal(parseAssistantConversationId({ conversationId: uuid }), uuid);
  const legacy = "th_m3k2j1h0_ab12cd34";
  assert.equal(parseAssistantConversationId({ conversationId: legacy }), legacy);
});

test("rejects absent, short, oversized, and garbage ids to ''", () => {
  assert.equal(parseAssistantConversationId({}), "");
  assert.equal(parseAssistantConversationId(null), "");
  assert.equal(parseAssistantConversationId({ conversationId: 42 }), "");
  assert.equal(parseAssistantConversationId({ conversationId: "short" }), "");
  assert.equal(parseAssistantConversationId({ conversationId: "x".repeat(65) }), "");
  assert.equal(
    parseAssistantConversationId({ conversationId: "has spaces here!" }),
    "",
  );
});

/* ---------------------------------------------------- rehydrateAssistantHistory */

/** A stored payload for one completed turn that ran a tool round. */
const storedMessages = [
  { role: "user", content: "list my pages" },
  {
    role: "assistant",
    content: "",
    tool_calls: [
      { id: "call_1", type: "function", function: { name: "list_pages", arguments: "{}" } },
    ],
  },
  { role: "tool", tool_call_id: "call_1", name: "list_pages", content: '{"pages":[]}' },
  { role: "assistant", content: "You have no pages yet." },
];
const storedPayload = JSON.stringify({ version: 1, messages: storedMessages });

test("replays the stored transcript verbatim and appends only the new user turn", () => {
  const client = [
    { role: "user", content: "list my pages" },
    { role: "assistant", content: "You have no pages yet." },
    { role: "user", content: "create one called Home" },
  ];
  const out = rehydrateAssistantHistory(storedPayload, client);
  assert.ok(out);
  // Byte-stable prefix: the stored entries come back verbatim, in order.
  assert.deepEqual(out.slice(0, storedMessages.length), storedMessages);
  // Only the new user turn is appended — verbatim, no stamping.
  assert.deepEqual(out[out.length - 1], { role: "user", content: "create one called Home" });
  assert.equal(out.length, storedMessages.length + 1);
});

test("appends an attachment content ARRAY new turn verbatim", () => {
  const newTurn = {
    role: "user",
    content: [
      { type: "text", text: "what is in this image?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ],
  };
  const client = [
    { role: "user", content: "list my pages" },
    { role: "assistant", content: "You have no pages yet." },
    newTurn,
  ];
  const out = rehydrateAssistantHistory(storedPayload, client);
  assert.ok(out);
  assert.deepEqual(out[out.length - 1], newTurn);
});

test("returns null when the last client message is not a user turn", () => {
  const client = [
    { role: "user", content: "list my pages" },
    { role: "assistant", content: "You have no pages yet." },
  ];
  assert.equal(rehydrateAssistantHistory(storedPayload, client), null);
  assert.equal(rehydrateAssistantHistory(storedPayload, []), null);
});

test("returns null on a user-count desync (retried/aborted turn)", () => {
  // The client carries an EXTRA user turn the store never persisted (a failed
  // send kept its bubble) — rehydration must refuse, caller falls back.
  const client = [
    { role: "user", content: "list my pages" },
    { role: "assistant", content: "You have no pages yet." },
    { role: "user", content: "this send failed" },
    { role: "user", content: "try again" },
  ];
  assert.equal(rehydrateAssistantHistory(storedPayload, client), null);
});

test("returns null on unparseable or empty stored payloads", () => {
  const client = [{ role: "user", content: "hi" }];
  assert.equal(rehydrateAssistantHistory("not json", client), null);
  assert.equal(rehydrateAssistantHistory("{}", client), null);
  assert.equal(rehydrateAssistantHistory('{"messages":[]}', client), null);
});

test("drops beheaded leading entries down to the first user turn", () => {
  // The size cap can drop the oldest entries mid-round; replaying must never
  // start with an orphan tool result.
  const beheaded = JSON.stringify({
    version: 1,
    messages: [
      { role: "tool", tool_call_id: "call_0", name: "get_page", content: "{}" },
      ...storedMessages,
    ],
  });
  const client = [
    { role: "user", content: "list my pages" },
    { role: "assistant", content: "You have no pages yet." },
    { role: "user", content: "ok" },
  ];
  const out = rehydrateAssistantHistory(beheaded, client);
  assert.ok(out);
  assert.equal(out[0].role, "user");
  assert.equal(out.length, storedMessages.length + 1);
});

/* -------------------------------------------------------- buildAssistantPayload */

const NOW = new Date("2026-07-23T12:00:00.000Z");

test("drops the system turn, stamps at, and carries model/context/usage", () => {
  const payload = buildAssistantPayload({
    transcript: [
      { role: "system", content: "You are the CMS assistant." },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi", at: "2026-07-23T11:59:00.000Z" },
    ],
    system: "You are the CMS assistant.",
    tools: [{ name: "list_pages" }],
    model: "openai/gpt-5.2",
    context: "page-builder",
    usage: { promptTokens: 100, completionTokens: 20 },
    now: NOW,
  });
  assert.equal(payload.version, 1);
  assert.equal(payload.system, "You are the CMS assistant.");
  assert.equal(payload.model, "openai/gpt-5.2");
  assert.equal(payload.context, "page-builder");
  assert.deepEqual(payload.usage, { promptTokens: 100, completionTokens: 20 });
  assert.equal(payload.messages.length, 2); // system dropped
  const [user, assistant] = payload.messages as Array<Record<string, unknown>>;
  assert.equal(user.at, NOW.toISOString()); // stamped
  assert.equal(assistant.at, "2026-07-23T11:59:00.000Z"); // preserved
});

test("size-caps the payload by dropping oldest messages", () => {
  const big = "x".repeat(200_000);
  const payload = buildAssistantPayload({
    transcript: [
      { role: "user", content: big },
      { role: "assistant", content: big },
      { role: "user", content: big },
      { role: "assistant", content: "small final answer" },
    ],
    system: "sys",
    tools: [],
    model: "m",
    context: "general",
    usage: { promptTokens: 0, completionTokens: 0 },
    now: NOW,
  });
  assert.equal(payload.truncated, true);
  assert.ok(JSON.stringify(payload).length <= MAX_PAYLOAD_BYTES);
  // The newest message survives.
  const last = payload.messages[payload.messages.length - 1] as Record<string, unknown>;
  assert.equal(last.content, "small final answer");
});

test("the reserved agent id can never collide with a minted UUID", () => {
  // Real agents use crypto.randomUUID(); the sentinel is deliberately not a UUID.
  assert.equal(ASSISTANT_AGENT_ID, "cms-assistant");
  assert.doesNotMatch(
    ASSISTANT_AGENT_ID,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
});
