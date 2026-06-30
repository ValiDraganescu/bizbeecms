/**
 * cms-mcp Slice 3 — JSON-RPC envelope + MCP dispatch mapping. Pure, runs under
 * `node --test` (mcp-core.ts has no `@/`/CF imports). Verifies the spike's
 * transport contract WITHOUT a live agent: tools/list maps the shared registry,
 * tools/call routes to the injected dispatch, notifications return no body, and
 * bad envelopes / unknown methods produce the right JSON-RPC errors.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleRpc,
  parseJsonRpc,
  parseToolCall,
  toMcpTools,
  toMcpToolResult,
  chooseMcpUrl,
  RPC_METHOD_NOT_FOUND,
  RPC_INVALID_REQUEST,
  MCP_PROTOCOL_VERSION,
  AUTHORING_PROMPT_NAME,
  type McpTool,
} from "./mcp-core.ts";

const FAKE_SCHEMAS = [
  { type: "function", function: { name: "list_pages", description: "list pages", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "create_page", description: "make a page", parameters: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] } } },
  { type: "function", function: { name: "no_params" } }, // missing parameters → default empty schema
  { nope: true }, // non-conforming → skipped
];

const listTools = (): McpTool[] => toMcpTools(FAKE_SCHEMAS);
// Echo dispatcher: returns the structured {name, ok, …} shape runTool would.
const runTool = async (name: string, args: unknown) => ({ name, ok: true, echo: args });
// Echo the requested context so prompts/get coverage can assert it's threaded.
const getPrompt = async (context: string | undefined) => `PROMPT[${context ?? "general"}]`;
const deps = { listTools, runTool, getPrompt };

test("toMcpTools maps function schemas to MCP {name,description,inputSchema}, skips junk", () => {
  const tools = toMcpTools(FAKE_SCHEMAS);
  assert.deepEqual(tools.map((t) => t.name), ["list_pages", "create_page", "no_params"]);
  assert.equal(tools[0].description, "list pages");
  assert.deepEqual(tools[1].inputSchema, { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] });
  // no_params had no parameters → default empty object schema
  assert.deepEqual(tools[2].inputSchema, { type: "object", properties: {} });
});

test("parseJsonRpc accepts valid, rejects wrong version / missing method / bad id", () => {
  assert.deepEqual(parseJsonRpc({ jsonrpc: "2.0", id: 1, method: "ping" }), {
    jsonrpc: "2.0", id: 1, method: "ping", params: undefined,
  });
  assert.equal(parseJsonRpc({ jsonrpc: "1.0", method: "ping" }), null);
  assert.equal(parseJsonRpc({ jsonrpc: "2.0", id: 1 }), null);
  assert.equal(parseJsonRpc({ jsonrpc: "2.0", id: {}, method: "ping" }), null);
  assert.equal(parseJsonRpc("nope"), null);
});

test("initialize returns protocol version + tools capability + serverInfo", async () => {
  const res = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, deps);
  assert.ok(res && "result" in res);
  const r = (res as { result: Record<string, unknown> }).result;
  assert.equal(r.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.deepEqual(r.capabilities, { tools: {}, prompts: {} });
});

test("prompts/list advertises the authoring guide with an optional context arg", async () => {
  const res = await handleRpc({ jsonrpc: "2.0", id: 7, method: "prompts/list" }, deps);
  assert.ok(res && "result" in res);
  const prompts = (res as { result: { prompts: Array<{ name: string; arguments: Array<{ name: string; required?: boolean }> }> } }).result.prompts;
  assert.deepEqual(prompts.map((p) => p.name), [AUTHORING_PROMPT_NAME]);
  assert.equal(prompts[0].arguments[0].name, "context");
  assert.equal(prompts[0].arguments[0].required, false);
});

test("prompts/get threads the context arg to getPrompt and wraps it as a user message", async () => {
  const res = await handleRpc(
    { jsonrpc: "2.0", id: 8, method: "prompts/get", params: { name: AUTHORING_PROMPT_NAME, arguments: { context: "components" } } },
    deps,
  );
  assert.ok(res && "result" in res);
  const r = (res as { result: { messages: Array<{ role: string; content: { type: string; text: string } }> } }).result;
  assert.equal(r.messages[0].role, "user");
  assert.equal(r.messages[0].content.text, "PROMPT[components]");
});

test("prompts/get with no arguments defaults context to general", async () => {
  const res = await handleRpc(
    { jsonrpc: "2.0", id: 9, method: "prompts/get", params: { name: AUTHORING_PROMPT_NAME } },
    deps,
  );
  const text = (res as { result: { messages: Array<{ content: { text: string } }> } }).result.messages[0].content.text;
  assert.equal(text, "PROMPT[general]");
});

test("prompts/get rejects an unknown prompt name", async () => {
  const res = await handleRpc(
    { jsonrpc: "2.0", id: 10, method: "prompts/get", params: { name: "nope" } },
    deps,
  );
  assert.ok(res && "error" in res);
  assert.equal((res as { error: { code: number } }).error.code, RPC_INVALID_REQUEST);
});

test("tools/list returns the mapped registry", async () => {
  const res = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, deps);
  assert.ok(res && "result" in res);
  const tools = (res as { result: { tools: McpTool[] } }).result.tools;
  assert.deepEqual(tools.map((t) => t.name), ["list_pages", "create_page", "no_params"]);
});

test("tools/call routes name+arguments to the shared dispatch and wraps the result", async () => {
  const res = await handleRpc(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_page", arguments: { slug: "home" } } },
    deps,
  );
  assert.ok(res && "result" in res);
  const r = (res as { result: { content: Array<{ text: string }>; isError: boolean } }).result;
  assert.equal(r.isError, false);
  const payload = JSON.parse(r.content[0].text);
  assert.equal(payload.name, "create_page");
  assert.deepEqual(payload.echo, { slug: "home" });
});

test("tools/call defaults missing arguments to {} and rejects a missing name", async () => {
  const ok = await handleRpc(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_pages" } },
    deps,
  );
  assert.deepEqual(JSON.parse((ok as { result: { content: Array<{ text: string }> } }).result.content[0].text).echo, {});

  const bad = await handleRpc(
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: {} },
    deps,
  );
  assert.ok(bad && "error" in bad);
  assert.equal((bad as { error: { code: number } }).error.code, RPC_INVALID_REQUEST);
});

test("a failing tool result is marked isError:true so the agent can react", () => {
  const wrapped = toMcpToolResult({ name: "create_page", ok: false, errors: ["bad slug"] });
  assert.equal(wrapped.isError, true);
  assert.equal(JSON.parse(wrapped.content[0].text).errors[0], "bad slug");
});

test("notifications/initialized returns no response body (null)", async () => {
  const res = await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, deps);
  assert.equal(res, null);
});

test("unknown method → method-not-found error", async () => {
  const res = await handleRpc({ jsonrpc: "2.0", id: 6, method: "tools/banana" }, deps);
  assert.ok(res && "error" in res);
  assert.equal((res as { error: { code: number } }).error.code, RPC_METHOD_NOT_FOUND);
});

test("parseToolCall guards non-object params", () => {
  assert.ok("error" in parseToolCall(null));
  assert.ok("error" in parseToolCall({ name: "" }));
  assert.deepEqual(parseToolCall({ name: "x", arguments: { a: 1 } }), { name: "x", args: { a: 1 } });
});

test("chooseMcpUrl prefers APP_ORIGIN over request host (custom-domain bug fix)", () => {
  // APP_ORIGIN set (custom domain) wins even when admin is on workers.dev.
  assert.equal(
    chooseMcpUrl("https://cms.acme.com", "bizbeecms-cms-acme.workers.dev", "https"),
    "https://cms.acme.com/mcp",
  );
  // Trailing slashes stripped so /mcp is appended once.
  assert.equal(chooseMcpUrl("https://cms.acme.com/", null, null), "https://cms.acme.com/mcp");
  assert.equal(chooseMcpUrl("https://cms.acme.com///", null, null), "https://cms.acme.com/mcp");
});

test("chooseMcpUrl falls back to request host when APP_ORIGIN is unset (local dev)", () => {
  assert.equal(chooseMcpUrl(undefined, "localhost:3601", "http"), "http://localhost:3601/mcp");
  assert.equal(chooseMcpUrl("", "site.workers.dev", "https"), "https://site.workers.dev/mcp");
  assert.equal(chooseMcpUrl("  ", "site.workers.dev", null), "https://site.workers.dev/mcp"); // proto default
});

test("chooseMcpUrl returns a placeholder when nothing is known", () => {
  assert.equal(chooseMcpUrl(null, null, null), "https://<your-site>.workers.dev/mcp");
});
