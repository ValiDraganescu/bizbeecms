/**
 * chat-agent-export-import (pure): envelope build/parse round-trip, the shared
 * per-entry validator (token-naming errors, per-agent tolerance), dependency
 * vetting (drop exactly the missing refs + name them), and copy-name
 * allocation against the unique-name index. (node --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENTS_FORMAT,
  AGENTS_VERSION,
  agentsExportFilename,
  allocateCopyName,
  buildAgentsBundle,
  dataSourceRequestKey,
  parseAgentsBundle,
  parsePortableAgent,
  vetAgentDeps,
  type AgentDepCatalog,
  type PortableAgent,
} from "./portable.ts";
import { DEFAULT_LIMITS } from "./core.ts";

function makeAgent(overrides: Partial<PortableAgent> = {}): PortableAgent {
  return {
    name: "concierge",
    systemPrompt: "You help hotel guests.",
    model: "openai/gpt-4o-mini",
    enabled: true,
    welcomeMessage: "Hello!",
    limits: { ...DEFAULT_LIMITS },
    dataSources: [
      {
        sourceId: "src-1",
        requestId: "req-1",
        toolName: "Check availability",
        description: "Looks up free rooms",
      },
    ],
    collections: [
      {
        collection: "content_bookings",
        description: "Guest bookings",
        canQuery: true,
        canCreate: true,
        canUpdate: false,
        lookupFields: [],
      },
    ],
    ...overrides,
  };
}

// ── envelope round-trip ───────────────────────────────────────────────────────

test("buildAgentsBundle → parseAgentsBundle round-trips the agents verbatim", () => {
  const agents = [makeAgent(), makeAgent({ name: "sales", model: null, welcomeMessage: null })];
  const bundle = buildAgentsBundle(agents, "2026-07-24T12:00:00.000Z");
  assert.equal(bundle.format, AGENTS_FORMAT);
  assert.equal(bundle.version, AGENTS_VERSION);
  assert.equal(bundle.meta?.exportedAt, "2026-07-24T12:00:00.000Z");

  const parsed = parseAgentsBundle(JSON.stringify(bundle));
  assert.ok(parsed.ok);
  assert.equal(parsed.failed.length, 0);
  assert.deepEqual(parsed.agents, agents);
});

test("bundle carries no ids/timestamps/conversations/usage keys", () => {
  const bundle = buildAgentsBundle([makeAgent()]);
  const keys = Object.keys(bundle.agents[0]);
  assert.deepEqual(keys.sort(), [
    "collections",
    "dataSources",
    "enabled",
    "limits",
    "model",
    "name",
    "systemPrompt",
    "welcomeMessage",
  ]);
});

// ── envelope trust boundary ───────────────────────────────────────────────────

test("non-JSON file fails the whole bundle", () => {
  const r = parseAgentsBundle("not json {");
  assert.ok(!r.ok);
  assert.deepEqual(r.errors, ["the file is not valid JSON"]);
});

test("wrong format / version / agents shape fails with named tokens", () => {
  const r = parseAgentsBundle({ format: "bizbeecms.kit", version: 2, agents: "x" });
  assert.ok(!r.ok);
  assert.deepEqual(r.errors, [
    'format must be "bizbeecms.agents", got "bizbeecms.kit"',
    "unsupported version (expected 1, got 2)",
    "agents must be an array",
  ]);
});

test("a bad entry is reported by name with field errors; siblings still parse", () => {
  const good = makeAgent();
  const bundle = {
    format: AGENTS_FORMAT,
    version: AGENTS_VERSION,
    agents: [
      { name: "broken", systemPrompt: "", limits: { perIpPerMinute: "ten" } },
      good,
      42,
    ],
  };
  const r = parseAgentsBundle(bundle);
  assert.ok(r.ok);
  assert.deepEqual(r.agents, [good]);
  assert.equal(r.failed.length, 2);
  assert.equal(r.failed[0].name, "broken");
  assert.ok(r.failed[0].errors.some((e) => e.includes("systemPrompt is required")));
  assert.ok(r.failed[0].errors.some((e) => e.includes("limits.perIpPerMinute must be a number")));
  assert.equal(r.failed[1].name, "agent #3"); // nameless entry → positional label
  assert.ok(r.failed[1].errors.some((e) => e.includes("name is required")));
});

// ── shared entry validator ────────────────────────────────────────────────────

test("parsePortableAgent applies the CRUD defaults: enabled true, model null, limits defaulted", () => {
  const r = parsePortableAgent({ name: " a ", systemPrompt: " p " });
  assert.ok(r.ok);
  assert.deepEqual(r.agent, {
    name: "a",
    systemPrompt: "p",
    model: null,
    enabled: true,
    welcomeMessage: null,
    limits: { ...DEFAULT_LIMITS },
    dataSources: [],
    collections: [],
  });
});

test("parsePortableAgent names the exact bad allowlist field", () => {
  const r = parsePortableAgent({
    name: "a",
    systemPrompt: "p",
    dataSources: [{ sourceId: "s", requestId: "r", toolName: "t" }],
  });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => e.includes("dataSources[0].description is required")));
});

test("parsePortableAgent keeps a locale-object welcome in stored string form", () => {
  const r = parsePortableAgent({
    name: "a",
    systemPrompt: "p",
    welcomeMessage: { en: "Hello", fi: "Hei" },
  });
  assert.ok(r.ok);
  assert.equal(r.agent.welcomeMessage, JSON.stringify({ en: "Hello", fi: "Hei" }));
});

// ── dependency vetting ────────────────────────────────────────────────────────

const catalog: AgentDepCatalog = {
  collections: new Set(["content_bookings"]),
  dataSourceRequests: new Set([dataSourceRequestKey("src-1", "req-1")]),
};

test("vetAgentDeps keeps entries whose refs exist (and returns the same agent)", () => {
  const agent = makeAgent();
  const { agent: vetted, dropped } = vetAgentDeps(agent, catalog);
  assert.deepEqual(dropped, []);
  assert.deepEqual(vetted, agent);
});

test("vetAgentDeps drops exactly the missing refs and names each one", () => {
  const agent = makeAgent({
    dataSources: [
      ...makeAgent().dataSources,
      {
        sourceId: "src-1",
        requestId: "req-GONE",
        toolName: "Cancel booking",
        description: "Cancels",
      },
    ],
    collections: [
      ...makeAgent().collections,
      {
        collection: "content_missing",
        description: "Nope",
        canQuery: true,
        canCreate: false,
        canUpdate: false,
        lookupFields: [],
      },
    ],
  });
  const { agent: vetted, dropped } = vetAgentDeps(agent, catalog);
  assert.deepEqual(vetted.dataSources, makeAgent().dataSources);
  assert.deepEqual(vetted.collections, makeAgent().collections);
  assert.deepEqual(dropped, [
    'data-source tool "Cancel booking" — request req-GONE on source src-1 does not exist on this site',
    'collection "content_missing" does not exist on this site',
  ]);
  // never mutates the input
  assert.equal(agent.dataSources.length, 2);
  assert.equal(agent.collections.length, 2);
});

test("a request id existing under a DIFFERENT source does not satisfy the pair", () => {
  const { dropped } = vetAgentDeps(
    makeAgent({
      dataSources: [
        { sourceId: "src-2", requestId: "req-1", toolName: "t", description: "d" },
      ],
    }),
    catalog,
  );
  assert.equal(dropped.length, 1);
  assert.ok(dropped[0].includes("req-1 on source src-2"));
});

// ── copy-name allocation ──────────────────────────────────────────────────────

test("allocateCopyName: free name stays; clash suffixes -2; -2 taken → -3", () => {
  assert.equal(allocateCopyName("bot", new Set()), "bot");
  assert.equal(allocateCopyName("bot", new Set(["bot"])), "bot-2");
  assert.equal(allocateCopyName("bot", new Set(["bot", "bot-2"])), "bot-3");
  assert.equal(allocateCopyName("bot", new Set(["bot", "bot-3"])), "bot-2");
});

// ── filename ──────────────────────────────────────────────────────────────────

test("agentsExportFilename: single selection slugs the agent, multi is generic", () => {
  assert.equal(agentsExportFilename(["Hotel Concierge!"]), "hotel-concierge.agents.json");
  assert.equal(agentsExportFilename(["a", "b"]), "chat-agents.agents.json");
  assert.equal(agentsExportFilename(["§§§"]), "chat-agents.agents.json");
});
