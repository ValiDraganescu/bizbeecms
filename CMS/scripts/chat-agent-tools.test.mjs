/**
 * public-guest-chatbots Slice 6 — tests for the AI chat-agent tools' PURE parts
 * (chat-agent-tools.ts): validateCreateChatAgent / validateUpdateChatAgent arg
 * shaping (delegating config validation to the pure public-chat core) and
 * formatAgentForModel (the model-facing summary — counts + limit summary, NEVER
 * the raw JSON columns). The CF-coupled handlers (store CRUD, JSON round-trip)
 * live in tool-dispatch.ts and are build-verified. Dep-free `node --test`;
 * imports the REAL .ts via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateCreateChatAgent,
  validateUpdateChatAgent,
  formatAgentForModel,
} from "../src/lib/chat/chat-agent-tools.ts";
import { DEFAULT_LIMITS, parseAgentConfig } from "../src/lib/public-chat/core.ts";

// ── create_chat_agent ─────────────────────────────────────────────────────────

test("create requires a non-empty name and systemPrompt", () => {
  assert.equal(validateCreateChatAgent(null).ok, false);
  assert.equal(validateCreateChatAgent({ systemPrompt: "p" }).ok, false);
  assert.equal(validateCreateChatAgent({ name: "Bot" }).ok, false);
  assert.equal(validateCreateChatAgent({ name: "  ", systemPrompt: "p" }).ok, false);
});

test("create: minimal agent defaults enabled=true, model/welcome null, empty allowlists + default limits", () => {
  const r = validateCreateChatAgent({ name: "Booking", systemPrompt: "You book tables." });
  assert.ok(r.ok);
  assert.equal(r.value.name, "Booking");
  assert.equal(r.value.enabled, true);
  assert.equal(r.value.model, null);
  assert.equal(r.value.welcomeMessage, null);
  assert.deepEqual(r.value.config.dataSources, []);
  assert.deepEqual(r.value.config.collections, []);
  assert.deepEqual(r.value.config.limits, DEFAULT_LIMITS);
});

test("create: partial limits fall back per-key; the rest keep defaults", () => {
  const r = validateCreateChatAgent({
    name: "x", systemPrompt: "p", enabled: false, model: "some/model",
    limits: { perIpPerMinute: 3 },
  });
  assert.ok(r.ok);
  assert.equal(r.value.enabled, false);
  assert.equal(r.value.model, "some/model");
  assert.equal(r.value.config.limits.perIpPerMinute, 3);
  assert.equal(r.value.config.limits.perIpPerDay, DEFAULT_LIMITS.perIpPerDay);
});

test("create: a bad config field is rejected with a self-correcting message", () => {
  // canUpdate without lookupFields is the core's flagship strict-mode rejection.
  const bad = validateCreateChatAgent({
    name: "x", systemPrompt: "p",
    collections: [{ collection: "content_bookings", description: "bookings", canUpdate: true }],
  });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /lookupFields/);

  const overCeiling = validateCreateChatAgent({
    name: "x", systemPrompt: "p", limits: { maxToolRounds: 999 },
  });
  assert.equal(overCeiling.ok, false);
  assert.match(overCeiling.error, /maxToolRounds/);
});

test("create: a full allowlist round-trips into typed config", () => {
  const r = validateCreateChatAgent({
    name: "x", systemPrompt: "p",
    dataSources: [{ sourceId: "s1", requestId: "r1", toolName: "Weather", description: "gets weather" }],
    collections: [{ collection: "content_bookings", description: "table bookings", canQuery: true, canCreate: true }],
  });
  assert.ok(r.ok);
  assert.equal(r.value.config.dataSources.length, 1);
  assert.equal(r.value.config.dataSources[0].sourceId, "s1");
  assert.equal(r.value.config.collections[0].canCreate, true);
  assert.equal(r.value.config.collections[0].canUpdate, false);
});

// ── update_chat_agent ─────────────────────────────────────────────────────────

test("update requires the agent ref plus a full name + systemPrompt", () => {
  assert.equal(validateUpdateChatAgent({ name: "x", systemPrompt: "p" }).ok, false); // no agent
  assert.equal(validateUpdateChatAgent({ agent: "id1", systemPrompt: "p" }).ok, false); // no name
  assert.equal(validateUpdateChatAgent({ agent: "id1", name: "x" }).ok, false); // no prompt
});

test("update: carries the id-or-name ref through as `ref`", () => {
  const r = validateUpdateChatAgent({ agent: "Booking", name: "Booking", systemPrompt: "new persona" });
  assert.ok(r.ok);
  assert.equal(r.value.ref, "Booking");
  assert.equal(r.value.systemPrompt, "new persona");
});

// ── formatAgentForModel (the model-facing summary) ────────────────────────────

test("formatAgentForModel returns counts + a limit summary, never raw JSON", () => {
  const config = parseAgentConfig(
    JSON.stringify({ perIpPerMinute: 5 }),
    JSON.stringify([{ sourceId: "s1", requestId: "r1", toolName: "w", description: "d" }]),
    JSON.stringify([
      { collection: "content_a", description: "a", canQuery: true },
      { collection: "content_b", description: "b", canUpdate: true, lookupFields: ["email"] },
    ]),
  );
  const out = formatAgentForModel(
    { id: "id1", name: "Booking", enabled: true, model: "some/model" },
    config,
  );
  assert.equal(out.id, "id1");
  assert.equal(out.enabled, true);
  assert.equal(out.dataSourceTools, 1);
  assert.equal(out.collectionTools, 2);
  assert.equal(out.updatableCollections, 1);
  assert.equal(out.limits.perIpPerMinute, 5);
  // No raw JSON strings leak into the DTO.
  assert.ok(!Object.values(out).some((v) => typeof v === "string" && v.trim().startsWith("[")));
});
