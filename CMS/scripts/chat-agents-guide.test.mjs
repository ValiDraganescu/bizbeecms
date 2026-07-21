/**
 * Pure unit tests for the on-demand chat-agents guide tool
 * (public-guest-chatbots, AI-assistant enablement): the tool schema, the guide
 * content (locked to the SHIPPED tool surface + config semantics so a rename
 * can't silently make the guide lie), and its registration in the pure tool
 * scopes.
 *
 * Run: node --test scripts/chat-agents-guide.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GET_CHAT_AGENTS_GUIDE_TOOL,
  CHAT_AGENTS_GUIDE,
} from "../src/lib/chat/chat-agents-guide.ts";
import {
  KNOWN_TOOL_NAMES,
  toolsForContext,
  contextPrompt,
} from "../src/lib/chat/tool-scopes.ts";

test("tool schema: zero-arg function named get_chat_agents_guide", () => {
  const fn = GET_CHAT_AGENTS_GUIDE_TOOL.function;
  assert.equal(GET_CHAT_AGENTS_GUIDE_TOOL.type, "function");
  assert.equal(fn.name, "get_chat_agents_guide");
  assert.ok(fn.description.length > 100, "description should say when to call it");
  assert.deepEqual(fn.parameters.required, []);
  assert.deepEqual(fn.parameters.properties, {});
});

test("guide covers the full shipped chat-agent tool surface", () => {
  for (const tool of [
    "list_chat_agents",
    "create_chat_agent",
    "update_chat_agent",
    "delete_chat_agent",
    "list_data_sources",
    "query_collection",
  ]) {
    assert.ok(CHAT_AGENTS_GUIDE.includes(tool), `guide should mention ${tool}`);
  }
  // Key semantics the guide must state (verified against the shipped code/core).
  for (const fact of [
    "GuestChat", // the placement block
    "PUBLISHED", // queries see published items only
    "DRAFT", // creates/updates land as drafts
    "lookupFields", // update scoping
    "canQuery",
    "canCreate",
    "canUpdate",
    "siteMessagesPerDay", // cost backstop limit
    "maxToolRounds",
    "sourceId", // dataSources entry shape
    "requestId",
    "FULL-REPLACE", // update semantics
  ]) {
    assert.ok(CHAT_AGENTS_GUIDE.includes(fact), `guide should state: ${fact}`);
  }
});

test("every tool name the guide references exists (no drift on renames)", () => {
  const known = new Set(KNOWN_TOOL_NAMES);
  const mentioned = CHAT_AGENTS_GUIDE.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
  for (const t of mentioned) {
    assert.ok(known.has(t), `guide mentions unknown tool-like token "${t}" — renamed tool or typo?`);
  }
});

test("registered in the pure tool scopes + surfaced in the context prompt", () => {
  assert.ok(KNOWN_TOOL_NAMES.includes("get_chat_agents_guide"));
  // The chat-agents context exposes the full agent CRUD + the guide + discovery.
  for (const t of [
    "list_chat_agents",
    "create_chat_agent",
    "update_chat_agent",
    "delete_chat_agent",
    "get_chat_agents_guide",
    "list_data_sources",
    "query_collection",
  ]) {
    assert.ok(toolsForContext("chat-agents").includes(t), `chat-agents should expose ${t}`);
  }
  // Page-building assistants can discover agents to reference from a block.
  assert.ok(toolsForContext("page-builder").includes("list_chat_agents"));
  assert.ok(toolsForContext("pages").includes("list_chat_agents"));
  // general gets everything automatically.
  assert.ok(toolsForContext("general").includes("get_chat_agents_guide"));
  // The model must KNOW the guide exists on the chat-agents page.
  assert.ok(contextPrompt("chat-agents").includes("get_chat_agents_guide"));
});
