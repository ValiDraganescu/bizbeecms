/**
 * Pure JSON-RPC 2.0 / MCP envelope + dispatch core for the ProjectManager's
 * remote MCP server (pm-mcp Slice 1). Ported from CMS/src/app/mcp/mcp-core.ts.
 *
 * Transport = Streamable HTTP, stateless JSON mode: the client POSTs one JSON-RPC
 * message, we reply with ONE JSON-RPC response as `application/json`. No SDK
 * (Node-coupled/heavy); the handful of methods we need is hand-rolled. Claude Code
 * adds the PM as a remote MCP server (URL + bearer header) and the tools appear.
 *
 * This file is PURE (no `@/`, no D1/CF imports) so it's node-`--test` loadable.
 * Tools are injected by the route as a `ToolRegistry` (name → schema + handler)
 * so the same registry can later back an in-PM assistant without forking.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const SERVER_INFO = { name: "bizbeecms-project-manager", version: "1.0.0" } as const;

// ── JSON-RPC 2.0 types (the subset we speak) ──────────────────────────────────
export type JsonRpcId = string | number | null;
export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string } };

export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INTERNAL_ERROR = -32603;

/** An MCP tools/list entry. */
export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/** Structured tool result: `{ ok, ... }`. `ok:false` → MCP `isError`. */
export type ToolResult = { ok: boolean } & Record<string, unknown>;

/**
 * A registered tool: its MCP schema + handler. `ctx` is whatever the route
 * injects (the acting user, etc.) — the core never inspects it.
 */
export type ToolDef<Ctx> = McpTool & {
  run: (args: Record<string, unknown>, ctx: Ctx) => Promise<ToolResult>;
};
export type ToolRegistry<Ctx> = ReadonlyArray<ToolDef<Ctx>>;

/** Strip handlers → the public tools/list payload. */
export function toMcpTools<Ctx>(registry: ToolRegistry<Ctx>): McpTool[] {
  return registry.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}

/** Parse + shape-check a JSON-RPC request. Returns null when it's not one. */
export function parseJsonRpc(body: unknown): JsonRpcRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.jsonrpc !== "2.0" || typeof b.method !== "string") return null;
  const id = b.id;
  if (id !== undefined && typeof id !== "string" && typeof id !== "number" && id !== null) {
    return null;
  }
  return { jsonrpc: "2.0", id: id as JsonRpcId, method: b.method, params: b.params };
}

export function rpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
export function rpcError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** Pull `{ name, arguments }` out of a tools/call params object. */
export function parseToolCall(
  params: unknown,
): { name: string; args: Record<string, unknown> } | { error: string } {
  if (typeof params !== "object" || params === null) {
    return { error: "params must be an object with a tool name" };
  }
  const p = params as Record<string, unknown>;
  if (typeof p.name !== "string" || p.name.length === 0) {
    return { error: "params.name (tool name) is required" };
  }
  const a = p.arguments;
  const args =
    typeof a === "object" && a !== null && !Array.isArray(a)
      ? (a as Record<string, unknown>)
      : {};
  return { name: p.name, args };
}

/** Wrap a tool result as an MCP `tools/call` result (one JSON text block). */
export function toMcpToolResult(result: ToolResult): {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: result.ok === false,
  };
}

/**
 * Run a named tool from the registry. Unknown name → `{ok:false, error}` (an
 * MCP tool error, NOT a JSON-RPC error — the agent can recover by re-listing).
 * Handler throws are caught into `{ok:false, error}` too, so one bad tool never
 * turns into an opaque -32603.
 */
export async function runRegistryTool<Ctx>(
  registry: ToolRegistry<Ctx>,
  name: string,
  args: Record<string, unknown>,
  ctx: Ctx,
): Promise<ToolResult> {
  const tool = registry.find((t) => t.name === name);
  if (!tool) {
    return {
      ok: false,
      error: `unknown tool: ${name}`,
      hint: "call tools/list for the available tools",
    };
  }
  try {
    return await tool.run(args, ctx);
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? "tool failed" };
  }
}

/**
 * Dispatch a parsed JSON-RPC request to an MCP method. Notifications (no `id`)
 * get a null sentinel so the caller returns 202/no-body. Unknown methods →
 * method-not-found.
 */
export async function handleRpc(
  req: JsonRpcRequest,
  deps: {
    listTools: () => McpTool[];
    runTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  },
): Promise<JsonRpcResponse | null> {
  const isNotification = req.id === undefined;
  const id = (req.id ?? null) as JsonRpcId;

  switch (req.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: deps.listTools() });

    case "tools/call": {
      const call = parseToolCall(req.params);
      if ("error" in call) return rpcError(id, RPC_INVALID_REQUEST, call.error);
      const result = await deps.runTool(call.name, call.args);
      return rpcResult(id, toMcpToolResult(result));
    }

    default:
      if (isNotification) return null;
      return rpcError(id, RPC_METHOD_NOT_FOUND, `unknown method: ${req.method}`);
  }
}

