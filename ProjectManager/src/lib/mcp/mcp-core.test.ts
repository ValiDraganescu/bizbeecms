import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleRpc,
  parseJsonRpc,
  parseToolCall,
  runRegistryTool,
  toMcpTools,
  RPC_INVALID_REQUEST,
  RPC_METHOD_NOT_FOUND,
  type ToolRegistry,
} from "./mcp-core.ts";

type Ctx = { userId: string };
const registry: ToolRegistry<Ctx> = [
  {
    name: "whoami",
    description: "who",
    inputSchema: { type: "object", properties: {} },
    run: async (_a, ctx) => ({ ok: true, userId: ctx.userId }),
  },
  {
    name: "boom",
    description: "throws",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      throw new Error("kaboom");
    },
  },
];
const deps = {
  listTools: () => toMcpTools(registry),
  runTool: (n: string, a: Record<string, unknown>) =>
    runRegistryTool(registry, n, a, { userId: "u1" }),
};

test("parseJsonRpc accepts 2.0 requests and rejects junk", () => {
  assert.ok(parseJsonRpc({ jsonrpc: "2.0", id: 1, method: "ping" }));
  assert.equal(parseJsonRpc({ jsonrpc: "1.0", method: "ping" }), null);
  assert.equal(parseJsonRpc({ jsonrpc: "2.0", id: {}, method: "ping" }), null);
  assert.equal(parseJsonRpc("nope"), null);
});

test("initialize advertises tools capability + protocol version", async () => {
  const r = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, deps);
  assert.ok(r && "result" in r);
  const res = r.result as { protocolVersion: string; capabilities: object };
  assert.equal(res.protocolVersion, "2025-06-18");
  assert.deepEqual(res.capabilities, { tools: {} });
});

test("notifications return null (202, no body)", async () => {
  assert.equal(
    await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, deps),
    null,
  );
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/whatever" }, deps), null);
});

test("tools/list strips handlers", async () => {
  const r = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, deps);
  const tools = (r as { result: { tools: unknown[] } }).result.tools;
  assert.equal(tools.length, 2);
  assert.deepEqual(Object.keys(tools[0] as object).sort(), ["description", "inputSchema", "name"]);
});

test("tools/call runs the handler with ctx and wraps result", async () => {
  const r = await handleRpc(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "whoami" } },
    deps,
  );
  const res = (r as { result: { content: { text: string }[]; isError: boolean } }).result;
  assert.equal(res.isError, false);
  assert.deepEqual(JSON.parse(res.content[0].text), { ok: true, userId: "u1" });
});

test("unknown tool + throwing tool → isError tool results, not RPC errors", async () => {
  const unknown = await runRegistryTool(registry, "nope", {}, { userId: "u" });
  assert.equal(unknown.ok, false);
  assert.match(String(unknown.error), /unknown tool/);
  const thrown = await runRegistryTool(registry, "boom", {}, { userId: "u" });
  assert.deepEqual(thrown, { ok: false, error: "kaboom" });
});

test("tools/call without a name → invalid request; unknown method → not found", async () => {
  const bad = await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: {} }, deps);
  assert.equal((bad as { error: { code: number } }).error.code, RPC_INVALID_REQUEST);
  const nf = await handleRpc({ jsonrpc: "2.0", id: 5, method: "resources/list" }, deps);
  assert.equal((nf as { error: { code: number } }).error.code, RPC_METHOD_NOT_FOUND);
});

test("parseToolCall defaults non-object arguments to {}", () => {
  assert.deepEqual(parseToolCall({ name: "x", arguments: [1] }), { name: "x", args: {} });
  assert.deepEqual(parseToolCall({ name: "x", arguments: { a: 1 } }), { name: "x", args: { a: 1 } });
});
