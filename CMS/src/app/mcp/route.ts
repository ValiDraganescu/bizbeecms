/**
 * Remote MCP server for this per-Site CMS Worker (cms-mcp Slice 3).
 *
 * Mounts `/mcp` as a Streamable-HTTP MCP endpoint (transport spike → see
 * `mcp-core.ts`): a local Claude Code adds this site's URL + its API key as a
 * remote MCP server and ALL the assistant's tools appear, driven by the user's
 * OWN model (cheaper than the in-CMS chat — the Worker only runs tool handlers).
 *
 * Auth = the per-site API key (`requireApiKey`, Slice 2 — a SECOND guard, fully
 * separate from the cookie `requireAdmin`; the browser chat stays cookie-authed).
 * Tools come from the SHARED registry + dispatch (`tool-dispatch.ts`) so the chat
 * route and MCP run the SAME validated handlers and new tools appear for free.
 *
 * REST-only, no server actions (PM directive). Stateless JSON mode: POST one
 * JSON-RPC message, get one JSON-RPC response — no session, no SSE stream (our
 * tools are pure request/response, so we don't need server-initiated events).
 */
import { requireApiKey } from "@/lib/auth/api-key-guard";
import { allToolSchemas, runTool } from "@/lib/chat/tool-dispatch";
import { assembleSystemPrompt } from "@/lib/chat/assemble-prompt";
import { isAdminContext, type AdminPageContext } from "@/lib/chat/tool-scopes";
import {
  handleRpc,
  parseJsonRpc,
  rpcError,
  toMcpTools,
  RPC_PARSE_ERROR,
  RPC_INVALID_REQUEST,
  RPC_INTERNAL_ERROR,
  type McpTool,
} from "./mcp-core";

export const dynamic = "force-dynamic";

const listTools = (): McpTool[] => toMcpTools(allToolSchemas());

// Render the built-in authoring guide for a client-supplied context (unknown or
// missing → general), so an external MCP client gets the SAME system prompt the
// in-CMS chat assistant runs on.
const getPrompt = (context: string | undefined): Promise<string> => {
  const ctx: AdminPageContext = isAdminContext(context) ? context : "general";
  return assembleSystemPrompt(ctx);
};

export async function POST(request: Request): Promise<Response> {
  const denied = await requireApiKey(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, RPC_PARSE_ERROR, "invalid JSON body"), { status: 400 });
  }

  const req = parseJsonRpc(body);
  if (!req) {
    return Response.json(rpcError(null, RPC_INVALID_REQUEST, "not a JSON-RPC 2.0 request"), {
      status: 400,
    });
  }

  let response;
  try {
    response = await handleRpc(req, { listTools, runTool, getPrompt });
  } catch (err) {
    return Response.json(
      rpcError(req.id ?? null, RPC_INTERNAL_ERROR, (err as Error).message),
      { status: 200 }, // JSON-RPC errors ride a 200 envelope
    );
  }

  // Notification (no id) → 202 with no body per Streamable HTTP.
  if (response === null) return new Response(null, { status: 202 });
  return Response.json(response, { status: 200 });
}

// A bare GET is handy for "is this an MCP endpoint?" probes; we don't offer a
// standing SSE stream (stateless JSON mode), so advertise that with 405.
export async function GET(request: Request): Promise<Response> {
  const denied = await requireApiKey(request);
  if (denied) return denied;
  return Response.json(
    { error: "method_not_allowed", hint: "POST JSON-RPC 2.0 messages to this MCP endpoint" },
    { status: 405, headers: { allow: "POST" } },
  );
}
