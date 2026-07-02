/**
 * Dep-free unit tests for the shared tool-dispatch CORE (cms-mcp Slice 1).
 * Run: node --test scripts/tool-dispatch.test.mjs
 *
 * The real handlers (tool-dispatch.ts) are CF-coupled (import @/db/*), so they're
 * not node-loadable; the dispatch LOGIC + registry selection are pure and live in
 * tool-dispatch-core.ts. We also assert the chat route's shared registry
 * (tool-scopes KNOWN_TOOL_NAMES) is what dispatch will be keyed on — so every
 * scoped tool has a home and nothing goes dead. Project convention: import the
 * .ts directly via Node type-stripping (no @/ alias).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeDispatcher,
  selectToolSchemas,
} from "../src/lib/chat/tool-dispatch-core.ts";
import { KNOWN_TOOL_NAMES, toolsForContext } from "../src/lib/chat/tool-scopes.ts";

// ── makeDispatcher ────────────────────────────────────────────────────────────
test("dispatches a known tool and tags the result with name", async () => {
  const run = makeDispatcher({
    echo: async (args) => ({ ok: true, got: args }),
  });
  const res = await run("echo", { a: 1 });
  assert.deepEqual(res, { name: "echo", ok: true, got: { a: 1 } });
});

test("unknown tool → structured error, never throws", async () => {
  const run = makeDispatcher({});
  const res = await run("nope", {});
  assert.equal(res.name, "nope");
  assert.equal(res.ok, false);
  assert.match(res.errors[0], /unknown tool: nope/);
});

test("a throwing handler is caught → ok:false with the message", async () => {
  const run = makeDispatcher({
    boom: async () => {
      throw new Error("kaboom");
    },
  });
  const res = await run("boom", {});
  assert.deepEqual(res, { name: "boom", ok: false, errors: ["kaboom"] });
});

test("handler result cannot drop the name (name always set last)", async () => {
  const run = makeDispatcher({ t: async () => ({ ok: true }) });
  const res = await run("t", undefined);
  assert.equal(res.name, "t");
});

test("REGRESSION: a handler payload `name` never shadows the tool name", async () => {
  // Bug 2026-07-02: create_data_source spread formatSource() whose top-level
  // `name` (the SOURCE name) overwrote the tool name in SSE frames.
  const run = makeDispatcher({
    create_data_source: async () => ({ ok: true, name: "Smoke Posts" }),
  });
  const res = await run("create_data_source", {});
  assert.equal(res.name, "create_data_source");
  assert.equal(res.ok, true);
});

// ── selectToolSchemas ─────────────────────────────────────────────────────────
test("selectToolSchemas resolves names in order, skips unknowns", () => {
  const byName = { a: { id: "A" }, b: { id: "B" } };
  assert.deepEqual(selectToolSchemas(byName, ["b", "a", "missing"]), [
    { id: "B" },
    { id: "A" },
  ]);
});

// ── registry coverage (no dead tools) ─────────────────────────────────────────
test("every scoped tool name is a KNOWN_TOOL_NAME (shared registry)", () => {
  const known = new Set(KNOWN_TOOL_NAMES);
  for (const ctx of ["page-builder", "components", "pages", "settings", "media", "general"]) {
    for (const name of toolsForContext(ctx)) {
      assert.ok(known.has(name), `scoped tool "${name}" (${ctx}) missing from registry`);
    }
  }
});
