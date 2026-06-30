/**
 * Pure JSON-RPC 2.0 / MCP envelope + dispatch core (cms-mcp Slice 3).
 *
 * TRANSPORT SPIKE (decided 2026-06-22): a remote MCP server on a Cloudflare
 * Worker uses **Streamable HTTP** (the current MCP transport, superseding the old
 * HTTP+SSE pair). Our tool surface is pure request/response — no server-initiated
 * notifications — so we use the simplest spec-compliant mode: client POSTs a
 * JSON-RPC message, the server replies with a SINGLE JSON-RPC response as
 * `application/json` (Streamable HTTP permits `application/json` OR
 * `text/event-stream`; we pick JSON). No SDK: the MCP SDK is Node-coupled/heavy,
 * and the JSON-RPC we need is a few methods. Claude Code adds this as a remote MCP
 * server (URL + bearer header) and the tools appear.
 *
 * This file is PURE (no `@/`, no D1/CF imports) so it's node-`--test` loadable per
 * the project convention. It maps our function-calling tool schemas to MCP
 * `tools/list` entries and routes a parsed JSON-RPC request to the right method;
 * the actual tool RUN (`runTool`) is injected by the CF-coupled route so the data
 * path stays shared and unforked (see CAVEATS).
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const SERVER_INFO = { name: "bizbeecms-cms", version: "1.0.0" } as const;

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

// Standard JSON-RPC error codes.
export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INTERNAL_ERROR = -32603;

/** Our function-calling tool schema shape (from lib/chat/*-tool.ts). */
type FunctionTool = {
  type: "function";
  function: { name: string; description?: string; parameters?: unknown };
};

/** An MCP tools/list entry: { name, description, inputSchema }. */
export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

// ── MCP prompts ───────────────────────────────────────────────────────────────
// We expose the assistant's built-in authoring guide (buildSystemPrompt + context)
// as a single MCP prompt so an external client authors components by the SAME
// contract the in-CMS chat assistant follows — one source of truth, no drift.

/** The one prompt we advertise. `context` selects the admin-page slant. */
export const AUTHORING_PROMPT_NAME = "cms-authoring-guide";

const PROMPT_LIST = [
  {
    name: AUTHORING_PROMPT_NAME,
    description:
      "The CMS assistant's built-in system prompt: how to author components, " +
      "pages, and translations correctly for this Site (Site identity, existing " +
      "components, collections, locales). Fetch this before calling the build tools.",
    arguments: [
      {
        name: "context",
        description:
          "Admin-page slant: page-builder | components | pages | settings | " +
          "media | collections | general. Defaults to general.",
        required: false,
      },
    ],
  },
] as const;

const EMPTY_SCHEMA = { type: "object", properties: {} } as const;

/**
 * Map our function-calling tool schemas to MCP tool entries. `function.name` →
 * `name`, `function.description` → `description`, `function.parameters` →
 * `inputSchema` (MCP requires a JSON-Schema object; default to an empty object
 * schema when a tool takes no args). Non-conforming entries are skipped.
 */
export function toMcpTools(schemas: readonly unknown[]): McpTool[] {
  const out: McpTool[] = [];
  for (const s of schemas) {
    const fn = (s as FunctionTool | undefined)?.function;
    if (!fn || typeof fn.name !== "string") continue;
    const inputSchema =
      fn.parameters && typeof fn.parameters === "object"
        ? (fn.parameters as Record<string, unknown>)
        : { ...EMPTY_SCHEMA };
    out.push({
      name: fn.name,
      description: typeof fn.description === "string" ? fn.description : "",
      inputSchema,
    });
  }
  return out;
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
): { name: string; args: unknown } | { error: string } {
  if (typeof params !== "object" || params === null) {
    return { error: "params must be an object with a tool name" };
  }
  const p = params as Record<string, unknown>;
  if (typeof p.name !== "string" || p.name.length === 0) {
    return { error: "params.name (tool name) is required" };
  }
  return { name: p.name, args: p.arguments ?? {} };
}

/**
 * Wrap a tool dispatch result as an MCP `tools/call` result. MCP returns
 * `{ content: [...], isError }`; we serialize the structured `{name, ok, …}`
 * payload as one JSON text block and flag `isError` when `ok === false` so the
 * agent can react. (ponytail: text/json content, not typed resource blocks — the
 * agent reads JSON fine and our results are plain objects.)
 */
export function toMcpToolResult(dispatch: { ok?: unknown } & Record<string, unknown>): {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(dispatch) }],
    isError: dispatch.ok === false,
  };
}

/**
 * Dispatch a parsed JSON-RPC request to an MCP method. Pure except for the two
 * injected effects: `listTools()` (the shared registry → MCP tools) and
 * `runTool(name,args)` (the SHARED tool dispatch — NOT forked here). Notifications
 * (no `id`, e.g. `notifications/initialized`) get a null sentinel so the caller
 * returns 202/no-body. Unknown methods → method-not-found.
 */
export async function handleRpc(
  req: JsonRpcRequest,
  deps: {
    listTools: () => McpTool[];
    runTool: (name: string, args: unknown) => Promise<Record<string, unknown>>;
    /** Render the authoring guide for a given admin-page context (default general). */
    getPrompt: (context: string | undefined) => Promise<string>;
  },
): Promise<JsonRpcResponse | null> {
  const isNotification = req.id === undefined;
  const id = (req.id ?? null) as JsonRpcId;

  switch (req.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, prompts: {} },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null; // fire-and-forget; no response body

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: deps.listTools() });

    case "prompts/list":
      return rpcResult(id, { prompts: PROMPT_LIST });

    case "prompts/get": {
      const p = (req.params ?? {}) as Record<string, unknown>;
      if (p.name !== AUTHORING_PROMPT_NAME) {
        return rpcError(id, RPC_INVALID_REQUEST, `unknown prompt: ${String(p.name)}`);
      }
      const ctx = (p.arguments as Record<string, unknown> | undefined)?.context;
      const text = await deps.getPrompt(typeof ctx === "string" ? ctx : undefined);
      return rpcResult(id, {
        description: PROMPT_LIST[0].description,
        messages: [{ role: "user", content: { type: "text", text } }],
      });
    }

    case "tools/call": {
      const call = parseToolCall(req.params);
      if ("error" in call) return rpcError(id, RPC_INVALID_REQUEST, call.error);
      const result = await deps.runTool(call.name, call.args);
      return rpcResult(id, toMcpToolResult(result));
    }

    default:
      if (isNotification) return null; // ignore unknown notifications
      return rpcError(id, RPC_METHOD_NOT_FOUND, `unknown method: ${req.method}`);
  }
}

// ── Advertised MCP endpoint origin ────────────────────────────────────────────

/**
 * Choose the public origin to advertise the `/mcp` endpoint at (cms-mcp BUG fix,
 * USER 2026-06-24). Prefer the deployer-injected `APP_ORIGIN` — the site's
 * CONFIGURED public origin (its custom domain when one is attached, else the
 * workers.dev URL). Only fall back to the incoming request host when APP_ORIGIN
 * is unset (local dev), since the request host is what the admin happens to be
 * browsing on and can be wrong (admin on workers.dev while the site serves a
 * custom domain). Returns a placeholder when nothing is known.
 *
 * Trailing slashes on APP_ORIGIN are stripped so the caller appends `/mcp` once.
 * ponytail: pure string choice, no URL parsing needed.
 */
export function chooseMcpUrl(
  appOrigin: string | undefined | null,
  requestHost: string | undefined | null,
  proto: string | undefined | null,
): string {
  const configured = (appOrigin ?? "").trim().replace(/\/+$/, "");
  if (configured) return `${configured}/mcp`;
  if (requestHost) return `${(proto ?? "https")}://${requestHost}/mcp`;
  return "https://<your-site>.workers.dev/mcp";
}
