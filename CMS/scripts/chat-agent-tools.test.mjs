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
  validateUpdateChatAgentSettings,
  validateSetChatAgentLimits,
  validateSetChatAgentDataSource,
  validateSetChatAgentCollection,
  validateRemoveKey,
  applyLimitsPatch,
  upsertDataSourceEntry,
  removeDataSourceEntry,
  upsertCollectionEntry,
  removeCollectionEntry,
  formatAgentForModel,
  formatAgentDetailForModel,
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

// ── Granular edit surface (get + patch tools) ─────────────────────────────────

test("formatAgentDetailForModel returns the FULL config incl. prompt + allowlists", () => {
  const config = parseAgentConfig(
    JSON.stringify({ maxToolRounds: 4 }),
    JSON.stringify([{ sourceId: "s1", requestId: "r1", toolName: "w", description: "d", maxCallsPerConversation: 2 }]),
    JSON.stringify([{ collection: "content_a", description: "a", canQuery: true }]),
  );
  const out = formatAgentDetailForModel(
    {
      id: "id1", name: "Booking", enabled: false, model: null,
      systemPrompt: "You book tables.", welcomeMessage: "Hi!",
    },
    config,
  );
  assert.equal(out.systemPrompt, "You book tables.");
  assert.equal(out.welcomeMessage, "Hi!");
  assert.equal(out.limits.maxToolRounds, 4);
  assert.equal(out.limits.maxUserMessageLen, DEFAULT_LIMITS.maxUserMessageLen);
  assert.deepEqual(out.dataSources, [
    { sourceId: "s1", requestId: "r1", toolName: "w", description: "d", maxCallsPerConversation: 2 },
  ]);
  assert.equal(out.collections.length, 1);
  assert.equal(out.collections[0].canQuery, true);
});

test("settings patch: requires the ref and at least one field", () => {
  assert.equal(validateUpdateChatAgentSettings(null).ok, false);
  assert.equal(validateUpdateChatAgentSettings({ name: "x" }).ok, false); // no agent
  const empty = validateUpdateChatAgentSettings({ agent: "id1" });
  assert.equal(empty.ok, false);
  assert.match(empty.error, /at least one/);
});

test("settings patch: only supplied fields land in the patch; null clears model/welcome", () => {
  const r = validateUpdateChatAgentSettings({
    agent: "Booking", model: null, welcomeMessage: null, enabled: false,
  });
  assert.ok(r.ok);
  assert.equal(r.value.ref, "Booking");
  assert.deepEqual(r.value.patch, { model: null, welcomeMessage: null, enabled: false });
  assert.ok(!("name" in r.value.patch));
  assert.ok(!("systemPrompt" in r.value.patch));
});

test("settings patch: an empty name/systemPrompt is rejected with the fix named", () => {
  const badName = validateUpdateChatAgentSettings({ agent: "id1", name: "  " });
  assert.equal(badName.ok, false);
  assert.match(badName.error, /name/);
  const badPrompt = validateUpdateChatAgentSettings({ agent: "id1", systemPrompt: "" });
  assert.equal(badPrompt.ok, false);
  assert.match(badPrompt.error, /systemPrompt/);
});

test("limits patch: unknown keys and out-of-range values are named exactly", () => {
  const unknown = validateSetChatAgentLimits({ agent: "id1", limits: { bogusKey: 3 } });
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /bogusKey/);
  assert.match(unknown.error, /perIpPerMinute/); // lists the valid keys
  const over = validateSetChatAgentLimits({ agent: "id1", limits: { maxToolRounds: 999 } });
  assert.equal(over.ok, false);
  assert.match(over.error, /maxToolRounds/);
  const empty = validateSetChatAgentLimits({ agent: "id1", limits: {} });
  assert.equal(empty.ok, false);
});

test("limits patch: numbers set, null resets, omitted keys keep the stored value", () => {
  const r = validateSetChatAgentLimits({
    agent: "id1", limits: { maxToolRounds: 5, perIpPerDay: null },
  });
  assert.ok(r.ok);
  const current = { ...DEFAULT_LIMITS, maxToolRounds: 2, perIpPerDay: 42, perIpPerMinute: 7 };
  const next = applyLimitsPatch(current, r.value.patch);
  assert.equal(next.maxToolRounds, 5); // set
  assert.equal(next.perIpPerDay, DEFAULT_LIMITS.perIpPerDay); // reset
  assert.equal(next.perIpPerMinute, 7); // untouched
});

test("data-source entry validator reuses the strict core with flat arg names", () => {
  const bad = validateSetChatAgentDataSource({ agent: "id1", sourceId: "s1", requestId: "r1", toolName: "w" });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /description/);
  assert.ok(!bad.error.includes("dataSources[0]"), "errors should speak in flat arg names");
  const good = validateSetChatAgentDataSource({
    agent: "id1", sourceId: "s1", requestId: "r1", toolName: "w", description: "d",
  });
  assert.ok(good.ok);
  assert.equal(good.value.entry.toolName, "w");
});

test("collection entry validator enforces canUpdate ⇒ lookupFields", () => {
  const bad = validateSetChatAgentCollection({
    agent: "id1", collection: "content_a", description: "a", canUpdate: true,
  });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /lookupFields/);
  const good = validateSetChatAgentCollection({
    agent: "id1", collection: "content_a", description: "a", canQuery: true,
  });
  assert.ok(good.ok);
  assert.equal(good.value.entry.canQuery, true);
});

test("upsert appliers add new entries and replace by key, leaving the rest intact", () => {
  const base = [
    { sourceId: "s1", requestId: "r1", toolName: "a", description: "A" },
    { sourceId: "s1", requestId: "r2", toolName: "b", description: "B" },
  ];
  const added = upsertDataSourceEntry(base, { sourceId: "s1", requestId: "r3", toolName: "c", description: "C" });
  assert.equal(added.action, "added");
  assert.equal(added.list.length, 3);
  const replaced = upsertDataSourceEntry(base, { sourceId: "s9", requestId: "r9", toolName: "b", description: "B2" });
  assert.equal(replaced.action, "replaced");
  assert.equal(replaced.list.length, 2);
  assert.equal(replaced.list[1].description, "B2");
  assert.equal(replaced.list[0].description, "A"); // untouched
  assert.equal(base[1].description, "B"); // input not mutated

  const cols = [{ collection: "content_a", description: "a", canQuery: true, canCreate: false, canUpdate: false, lookupFields: [] }];
  const colAdd = upsertCollectionEntry(cols, { collection: "content_b", description: "b", canQuery: true, canCreate: false, canUpdate: false, lookupFields: [] });
  assert.equal(colAdd.action, "added");
  const colRep = upsertCollectionEntry(cols, { collection: "content_a", description: "a2", canQuery: false, canCreate: true, canUpdate: false, lookupFields: [] });
  assert.equal(colRep.action, "replaced");
  assert.equal(colRep.list[0].description, "a2");
});

test("remove appliers drop by key; unknown keys error listing what exists", () => {
  const base = [
    { sourceId: "s1", requestId: "r1", toolName: "a", description: "A" },
    { sourceId: "s1", requestId: "r2", toolName: "b", description: "B" },
  ];
  const ok = removeDataSourceEntry(base, "a");
  assert.ok(ok.ok);
  assert.deepEqual(ok.list.map((e) => e.toolName), ["b"]);
  const miss = removeDataSourceEntry(base, "zzz");
  assert.equal(miss.ok, false);
  assert.match(miss.error, /"a", "b"/); // self-correcting: lists the real names

  const cols = [{ collection: "content_a", description: "a", canQuery: true, canCreate: false, canUpdate: false, lookupFields: [] }];
  const colMiss = removeCollectionEntry(cols, "content_zzz");
  assert.equal(colMiss.ok, false);
  assert.match(colMiss.error, /content_a/);
  const colOk = removeCollectionEntry(cols, "content_a");
  assert.ok(colOk.ok);
  assert.equal(colOk.list.length, 0);
});

test("validateRemoveKey requires the ref and the key", () => {
  assert.equal(validateRemoveKey({ toolName: "a" }, "toolName").ok, false);
  assert.equal(validateRemoveKey({ agent: "id1" }, "toolName").ok, false);
  const r = validateRemoveKey({ agent: "id1", toolName: " a " }, "toolName");
  assert.ok(r.ok);
  assert.equal(r.value.value, "a");
});
