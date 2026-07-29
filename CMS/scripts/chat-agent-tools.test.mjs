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
  shapeWelcomePatch,
  formatAgentForModel,
  formatAgentDetailForModel,
} from "../src/lib/chat/chat-agent-tools.ts";
import {
  mergeAgentPatch,
  applyWelcomePatch,
  applyLimitsPatch,
  applyDataSourceEntryPatch,
  applyCollectionEntryPatch,
  removeDataSourceEntry,
  removeCollectionEntry,
} from "../src/lib/chat/chat-agent-patch.ts";
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

// ── update_chat_agent (patch contract: omitted=keep, null=clear/reset) ────────

test("update requires the agent ref; name is NOT required; empty patch errors", () => {
  assert.equal(validateUpdateChatAgent({ name: "x", systemPrompt: "p" }).ok, false); // no agent
  const empty = validateUpdateChatAgent({ agent: "id1" });
  assert.equal(empty.ok, false);
  assert.match(empty.error, /nothing to change/);
  const r = validateUpdateChatAgent({ agent: "Booking", systemPrompt: "new persona" });
  assert.ok(r.ok); // no `name` needed
  assert.equal(r.value.ref, "Booking");
});

test("update: name/systemPrompt cannot be cleared (no default exists)", () => {
  const badName = validateUpdateChatAgent({ agent: "id1", name: null });
  assert.equal(badName.ok, false);
  assert.match(badName.error, /name cannot be cleared/);
  const badPrompt = validateUpdateChatAgent({ agent: "id1", systemPrompt: "  " });
  assert.equal(badPrompt.ok, false);
  assert.match(badPrompt.error, /systemPrompt cannot be cleared/);
});

test("update: null resets to defaults — model, limits, welcome, allowlists, enabled", () => {
  const r = validateUpdateChatAgent({
    agent: "id1", model: null, limits: null, welcomeMessage: null,
    dataSources: null, collections: null, enabled: null,
  });
  assert.ok(r.ok);
  assert.deepEqual(r.value.patch, {
    model: null,
    enabled: true,
    welcomeMessage: null,
    limits: DEFAULT_LIMITS,
    dataSources: [],
    collections: [],
  });
});

test("update: a supplied array replaces wholesale; omitted sections keep stored", () => {
  const r = validateUpdateChatAgent({
    agent: "id1",
    dataSources: [{ sourceId: "s2", requestId: "r2", toolName: "new", description: "N" }],
  });
  assert.ok(r.ok);
  const stored = { name: "A", systemPrompt: "p", model: "m", enabled: false, welcomeMessage: null };
  const storedConfig = parseAgentConfig(
    JSON.stringify({ maxToolRounds: 5 }),
    JSON.stringify([{ sourceId: "s1", requestId: "r1", toolName: "old", description: "O" }]),
    JSON.stringify([{ collection: "content_a", description: "a", canQuery: true }]),
  );
  const merged = mergeAgentPatch(stored, storedConfig, r.value.patch);
  assert.deepEqual(merged.config.dataSources.map((e) => e.toolName), ["new"]); // wholesale
  assert.equal(merged.config.collections.length, 1); // omitted section kept
  assert.equal(merged.config.limits.maxToolRounds, 5); // omitted limits kept
  assert.equal(merged.scalars.enabled, false); // omitted scalar kept
});

test("update: a supplied limits object replaces ALL limits (omitted keys → defaults)", () => {
  const r = validateUpdateChatAgent({ agent: "id1", limits: { perIpPerMinute: 3 } });
  assert.ok(r.ok);
  assert.equal(r.value.patch.limits.perIpPerMinute, 3);
  assert.equal(r.value.patch.limits.maxToolRounds, DEFAULT_LIMITS.maxToolRounds);
});

test("update: invalid config fields are still rejected by the strict core", () => {
  const bad = validateUpdateChatAgent({
    agent: "id1",
    collections: [{ collection: "content_a", description: "a", canUpdate: true }],
  });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /lookupFields/);
  const over = validateUpdateChatAgent({ agent: "id1", limits: { maxToolRounds: 999 } });
  assert.equal(over.ok, false);
  assert.match(over.error, /maxToolRounds/);
});

// ── REGRESSION (observed 2026-07-29): a systemPrompt-only update must NOT ─────
// re-default the agent's model + limits. Old code required `name` and, when
// model/limits were omitted, silently produced model=null + DEFAULT_LIMITS,
// which the handler then persisted — wiping the stored values.

test("REGRESSION: updating only systemPrompt keeps the stored model + limits", () => {
  const r = validateUpdateChatAgent({ agent: "Booking", systemPrompt: "new persona" });
  assert.ok(r.ok, "a systemPrompt-only update must validate without `name`");
  // The patch must not smuggle in re-defaulted fields.
  assert.deepEqual(Object.keys(r.value.patch), ["systemPrompt"]);

  const stored = {
    name: "Booking",
    systemPrompt: "old persona",
    model: "anthropic/claude-sonnet-4",
    enabled: true,
    welcomeMessage: "Hi!",
  };
  const storedConfig = parseAgentConfig(
    JSON.stringify({ maxToolRounds: 5, perIpPerDay: 42 }),
    JSON.stringify([{ sourceId: "s1", requestId: "r1", toolName: "book", description: "books" }]),
    "[]",
  );
  const merged = mergeAgentPatch(stored, storedConfig, r.value.patch);
  assert.equal(merged.scalars.systemPrompt, "new persona");
  assert.equal(merged.scalars.model, "anthropic/claude-sonnet-4"); // NOT re-defaulted to null
  assert.equal(merged.config.limits.maxToolRounds, 5); // NOT reset to DEFAULT_LIMITS
  assert.equal(merged.config.limits.perIpPerDay, 42);
  assert.equal(merged.scalars.welcomeMessage, "Hi!");
  assert.deepEqual(merged.config.dataSources, storedConfig.dataSources);
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

// ── welcomeMessage (per-locale merge) ─────────────────────────────────────────

test("welcome patch shaping: strings/null pass, locale objects normalize, bad input named", () => {
  assert.deepEqual(shapeWelcomePatch(null), { ok: true, value: null });
  assert.deepEqual(shapeWelcomePatch("  Hi!  "), { ok: true, value: "Hi!" });
  assert.deepEqual(shapeWelcomePatch(""), { ok: true, value: null }); // empty string = clear
  const obj = shapeWelcomePatch({ EN: " Hello ", fi: null, et: "" });
  assert.ok(obj.ok);
  assert.deepEqual(obj.value, { en: "Hello", fi: null, et: null }); // normalized; empty = remove

  const badKey = shapeWelcomePatch({ notalocale: "x" });
  assert.equal(badKey.ok, false);
  assert.match(badKey.error, /"notalocale"/);
  const badValue = shapeWelcomePatch({ en: 7 });
  assert.equal(badValue.ok, false);
  assert.match(badValue.error, /welcomeMessage\.en/);
  assert.equal(shapeWelcomePatch(["hi"]).ok, false);
});

test("welcome merge: supplied locales replace, omitted stay, null removes", () => {
  const stored = JSON.stringify({ en: "Hello", fi: "Hei", et: "Tere" });
  const next = applyWelcomePatch(stored, { fi: "Moi", et: null, sv: "Hej" });
  assert.deepEqual(JSON.parse(next), { en: "Hello", fi: "Moi", sv: "Hej" });
});

test("welcome merge: whole-field null clears; string replaces; last locale removed → null", () => {
  const stored = JSON.stringify({ en: "Hello" });
  assert.equal(applyWelcomePatch(stored, null), null);
  assert.equal(applyWelcomePatch(stored, "Plain greeting"), "Plain greeting");
  assert.equal(applyWelcomePatch(stored, { en: null }), null);
});

test("welcome merge: a stored plain string has no locale base — an object replaces it", () => {
  const next = applyWelcomePatch("Hello everyone", { fi: "Hei" });
  assert.deepEqual(JSON.parse(next), { fi: "Hei" });
  // ...and merging onto no stored greeting starts empty.
  assert.deepEqual(JSON.parse(applyWelcomePatch(null, { en: "Hi" })), { en: "Hi" });
});

test("welcome merge flows through mergeAgentPatch (update + settings share it)", () => {
  const stored = {
    name: "A", systemPrompt: "p", model: null, enabled: true,
    welcomeMessage: JSON.stringify({ en: "Hello", fi: "Hei" }),
  };
  const config = parseAgentConfig("{}", "[]", "[]");
  const r = validateUpdateChatAgent({ agent: "id1", welcomeMessage: { fi: "Moi" } });
  assert.ok(r.ok);
  const merged = mergeAgentPatch(stored, config, r.value.patch);
  assert.deepEqual(JSON.parse(merged.scalars.welcomeMessage), { en: "Hello", fi: "Moi" });
});

// ── set_chat_agent_limits ─────────────────────────────────────────────────────

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

// ── set_chat_agent_data_source / _collection (merge patches) ──────────────────

test("data-source patch validator: toolName is the key; only supplied fields land", () => {
  assert.equal(validateSetChatAgentDataSource({ agent: "id1" }).ok, false); // no toolName
  const r = validateSetChatAgentDataSource({ agent: "id1", toolName: "w", description: "d2" });
  assert.ok(r.ok);
  assert.equal(r.value.toolName, "w");
  assert.deepEqual(r.value.patch, { description: "d2" });

  const cleared = validateSetChatAgentDataSource({ agent: "id1", toolName: "w", sourceId: null });
  assert.equal(cleared.ok, false);
  assert.match(cleared.error, /sourceId cannot be cleared/);
  const nulls = validateSetChatAgentDataSource({
    agent: "id1", toolName: "w", maxCallsPerConversation: null, requiredParams: null,
  });
  assert.ok(nulls.ok);
  assert.deepEqual(nulls.value.patch, { maxCallsPerConversation: null, requiredParams: null });
});

test("data-source entry patch: matched entry merges — omitted keeps, null clears optionals", () => {
  const base = [
    { sourceId: "s1", requestId: "r1", toolName: "a", description: "A", maxCallsPerConversation: 2, requiredParams: ["from"] },
    { sourceId: "s1", requestId: "r2", toolName: "b", description: "B" },
  ];
  const merged = applyDataSourceEntryPatch(base, "a", { description: "A2" });
  assert.ok(merged.ok);
  assert.equal(merged.value.action, "updated");
  assert.deepEqual(merged.value.list[0], {
    sourceId: "s1", requestId: "r1", toolName: "a", description: "A2",
    maxCallsPerConversation: 2, requiredParams: ["from"], // kept
  });
  assert.equal(merged.value.list[1].description, "B"); // rest untouched
  assert.equal(base[0].description, "A"); // input not mutated

  const cleared = applyDataSourceEntryPatch(base, "a", { maxCallsPerConversation: null, requiredParams: null });
  assert.ok(cleared.ok);
  assert.ok(!("maxCallsPerConversation" in cleared.value.list[0]));
  assert.ok(!("requiredParams" in cleared.value.list[0]));

  const empty = applyDataSourceEntryPatch(base, "a", {});
  assert.equal(empty.ok, false);
  assert.match(empty.error, /nothing to change/);
});

test("data-source entry patch: no match still creates, requiring the full set", () => {
  const missing = applyDataSourceEntryPatch([], "new", { description: "D" });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /would ADD one/);
  assert.match(missing.error, /sourceId, requestId/); // names exactly what's missing
  const created = applyDataSourceEntryPatch([], "new", {
    sourceId: "s1", requestId: "r1", description: "D", maxCallsPerConversation: 3,
  });
  assert.ok(created.ok);
  assert.equal(created.value.action, "added");
  assert.deepEqual(created.value.list, [
    { sourceId: "s1", requestId: "r1", toolName: "new", description: "D", maxCallsPerConversation: 3 },
  ]);
});

test("data-source entry patch: the merged entry re-enters the strict core (flat names)", () => {
  const bad = applyDataSourceEntryPatch(
    [{ sourceId: "s1", requestId: "r1", toolName: "a", description: "A" }],
    "a",
    { maxCallsPerConversation: 0 },
  );
  assert.equal(bad.ok, false);
  assert.match(bad.error, /maxCallsPerConversation/);
  assert.ok(!bad.error.includes("dataSources[0]"), "errors should speak in flat arg names");
});

test("collection patch validator: collection is the key; null flags reset to false", () => {
  assert.equal(validateSetChatAgentCollection({ agent: "id1" }).ok, false); // no collection
  const r = validateSetChatAgentCollection({
    agent: "id1", collection: "content_a", canQuery: null, lookupFields: null,
  });
  assert.ok(r.ok);
  assert.deepEqual(r.value.patch, { canQuery: false, lookupFields: null });
  const cleared = validateSetChatAgentCollection({ agent: "id1", collection: "content_a", description: "" });
  assert.equal(cleared.ok, false);
  assert.match(cleared.error, /description cannot be cleared/);
});

test("collection entry patch: matched entry merges; lookupFields null-clear guarded by canUpdate", () => {
  const base = [
    { collection: "content_a", description: "a", canQuery: true, canCreate: false, canUpdate: true, lookupFields: ["email"] },
    { collection: "content_b", description: "b", canQuery: true, canCreate: false, canUpdate: false, lookupFields: [] },
  ];
  const merged = applyCollectionEntryPatch(base, "content_a", { canCreate: true });
  assert.ok(merged.ok);
  assert.equal(merged.value.action, "updated");
  assert.deepEqual(merged.value.list[0], {
    collection: "content_a", description: "a",
    canQuery: true, canCreate: true, canUpdate: true, lookupFields: ["email"], // kept
  });
  assert.equal(merged.value.list[1].description, "b"); // rest untouched

  // Clearing lookupFields while canUpdate stays true → the core rule fires.
  const bad = applyCollectionEntryPatch(base, "content_a", { lookupFields: null });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /lookupFields/);
  // Clearing both together is fine.
  const ok = applyCollectionEntryPatch(base, "content_a", { canUpdate: false, lookupFields: null });
  assert.ok(ok.ok);
  assert.deepEqual(ok.value.list[0].lookupFields, []);

  const empty = applyCollectionEntryPatch(base, "content_a", {});
  assert.equal(empty.ok, false);
  assert.match(empty.error, /nothing to change/);
});

test("collection entry patch: no match still creates, requiring description", () => {
  const missing = applyCollectionEntryPatch([], "content_new", { canQuery: true });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /would ADD/);
  assert.match(missing.error, /description/);
  const created = applyCollectionEntryPatch([], "content_new", { description: "new things", canQuery: true });
  assert.ok(created.ok);
  assert.equal(created.value.action, "added");
  assert.deepEqual(created.value.list, [
    { collection: "content_new", description: "new things", canQuery: true, canCreate: false, canUpdate: false, lookupFields: [] },
  ]);
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
