/**
 * Pure tests for the Chat Agents inline context formatter (roster + edit-page
 * modes). Runs under `node --test`; the module-level store/subscribers aren't
 * exercised.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatChatAgentsContext,
  MAX_CONTEXT_AGENTS,
  MAX_CONTEXT_PROMPT_CHARS,
  MAX_CONTEXT_ENTRIES,
  type AgentSummaryInfo,
  type AgentDetailInfo,
} from "./chat-agents-context.ts";
import { DEFAULT_LIMITS } from "../public-chat/core.ts";

function summary(over: Partial<AgentSummaryInfo> = {}): AgentSummaryInfo {
  return {
    id: "id-1",
    name: "Booking Assistant",
    enabled: true,
    model: "x-ai/some-model",
    dataSourceTools: 3,
    collectionTools: 1,
    ...over,
  };
}

function detail(over: Partial<AgentDetailInfo> = {}): AgentDetailInfo {
  return {
    id: "id-1",
    name: "Booking Assistant",
    enabled: true,
    model: null,
    welcomeMessage: "Hi!",
    systemPrompt: "You book tables.",
    limits: { ...DEFAULT_LIMITS },
    dataSources: [
      { sourceId: "s1", requestId: "r1", toolName: "check_availability", description: "checks tables" },
    ],
    collections: [
      {
        collection: "content_bookings",
        description: "bookings",
        canQuery: true,
        canCreate: true,
        canUpdate: true,
        lookupFields: ["email"],
      },
    ],
    ...over,
  };
}

test("null/empty input formats to nothing", () => {
  assert.equal(formatChatAgentsContext(null), "");
  assert.equal(formatChatAgentsContext(undefined), "");
  assert.equal(formatChatAgentsContext({}), "");
});

test("roster: lists each agent with id, state, model and tool counts", () => {
  const out = formatChatAgentsContext({
    agents: [summary(), summary({ id: "id-2", name: "FAQ Bot", enabled: false, model: null })],
  });
  assert.ok(out.startsWith("[Chat agents context]"));
  assert.ok(out.includes('"Booking Assistant" (id: id-1, enabled, model: x-ai/some-model)'));
  assert.ok(out.includes("3 data-source tools"));
  assert.ok(out.includes('"FAQ Bot" (id: id-2, DISABLED, model: site default)'));
  // Steers the model away from rediscovery and toward the granular tools.
  assert.ok(out.includes("do NOT call list_chat_agents"));
  assert.ok(out.includes("update_chat_agent_settings"));
});

test("roster: empty roster says so (prevents a pointless list call)", () => {
  const out = formatChatAgentsContext({ agents: [] });
  assert.ok(out.includes("NO chat agents yet"));
  assert.ok(out.includes("create_chat_agent"));
});

test("roster: overflow beyond the cap is summarized", () => {
  const agents = Array.from({ length: MAX_CONTEXT_AGENTS + 4 }, (_, i) =>
    summary({ id: `id-${i}`, name: `Agent ${i}` }),
  );
  const out = formatChatAgentsContext({ agents });
  assert.ok(out.includes("…and 4 more agents"));
});

test("editing: carries the FULL config — identity, limits, allowlists, prompt", () => {
  const out = formatChatAgentsContext({ editing: detail() });
  assert.ok(out.startsWith("[Chat agent edit context]"));
  assert.ok(out.includes('"Booking Assistant" (id: id-1, enabled, model: site default)'));
  assert.ok(out.includes(`maxToolRounds=${DEFAULT_LIMITS.maxToolRounds}`));
  assert.ok(out.includes('"check_availability" (sourceId: s1, requestId: r1): checks tables'));
  assert.ok(out.includes('"content_bookings" [query+create+update; lookup: email]: bookings'));
  assert.ok(out.includes("You book tables."));
  assert.ok(out.includes('Welcome message: "Hi!"'));
  // The whole point: no rediscovery round-trip.
  assert.ok(out.includes("do NOT call list_chat_agents or get_chat_agent"));
  assert.ok(out.includes("update_chat_agent_settings"));
});

test("editing wins over a roster passed alongside", () => {
  const out = formatChatAgentsContext({ agents: [summary()], editing: detail() });
  assert.ok(out.startsWith("[Chat agent edit context]"));
});

test("editing: empty allowlists and welcome are stated, not omitted", () => {
  const out = formatChatAgentsContext({
    editing: detail({ dataSources: [], collections: [], welcomeMessage: null }),
  });
  assert.ok(out.includes("Data-source tools: (none)"));
  assert.ok(out.includes("Collections: (none)"));
  assert.ok(out.includes("Welcome message: (none)"));
});

test("editing: a runaway prompt is truncated with a pointer to get_chat_agent", () => {
  const long = "x".repeat(MAX_CONTEXT_PROMPT_CHARS + 100);
  const out = formatChatAgentsContext({ editing: detail({ systemPrompt: long }) });
  assert.ok(out.includes("…(truncated — call get_chat_agent for the full prompt)"));
  assert.ok(!out.includes(long));
});

test("editing: allowlist overflow beyond the cap is summarized", () => {
  const many = Array.from({ length: MAX_CONTEXT_ENTRIES + 2 }, (_, i) => ({
    sourceId: "s1",
    requestId: `r${i}`,
    toolName: `tool_${i}`,
    description: `d${i}`,
  }));
  const out = formatChatAgentsContext({ editing: detail({ dataSources: many }) });
  assert.ok(out.includes(`Data-source tools (${MAX_CONTEXT_ENTRIES + 2}):`));
  assert.ok(out.includes("…and 2 more (get_chat_agent lists all)"));
});
