/**
 * Remote MCP server for the ProjectManager (pm-mcp).
 *
 * `POST /mcp` = Streamable-HTTP MCP endpoint in stateless JSON mode (one JSON-RPC
 * message in, one JSON-RPC response out — see `lib/mcp/mcp-core.ts`). Auth =
 * OAuth 2.1 ONLY: a bearer access token minted by our own `/oauth/token`. A
 * missing/invalid token gets a 401 + `WWW-Authenticate: Bearer resource_metadata=…`
 * so the client discovers the AS (`/.well-known/…`) and runs the PKCE flow.
 * Every tool then runs AS the granting user with their normal role/scope.
 */
import { checkBearer, corsHeaders, corsPreflight, unauthorized } from "@/lib/oauth/guard";
import {
  handleRpc,
  parseJsonRpc,
  rpcError,
  runRegistryTool,
  toMcpTools,
  RPC_PARSE_ERROR,
  RPC_INVALID_REQUEST,
  RPC_INTERNAL_ERROR,
} from "@/lib/mcp/mcp-core";
import { PM_TOOLS } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const auth = await checkBearer(request);
  if (!auth.allow) return unauthorized(request, auth.reason);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, RPC_PARSE_ERROR, "invalid JSON body"), {
      status: 400,
      headers: corsHeaders(),
    });
  }
  const req = parseJsonRpc(body);
  if (!req) {
    return Response.json(rpcError(null, RPC_INVALID_REQUEST, "not a JSON-RPC 2.0 request"), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const ctx = { user: auth.user, grantId: auth.grantId };
  let response;
  try {
    response = await handleRpc(req, {
      listTools: () => toMcpTools(PM_TOOLS),
      runTool: (name, args) => runRegistryTool(PM_TOOLS, name, args, ctx),
    });
  } catch (err) {
    return Response.json(rpcError(req.id ?? null, RPC_INTERNAL_ERROR, (err as Error).message), {
      status: 200,
      headers: corsHeaders(),
    });
  }
  if (response === null) return new Response(null, { status: 202, headers: corsHeaders() });
  return Response.json(response, { status: 200, headers: corsHeaders() });
}

/** No standing SSE stream (stateless JSON mode) — advertise with 405. */
export async function GET(request: Request): Promise<Response> {
  const auth = await checkBearer(request);
  if (!auth.allow) return unauthorized(request, auth.reason);
  return Response.json(
    { error: "method_not_allowed", hint: "POST JSON-RPC 2.0 messages to this MCP endpoint" },
    { status: 405, headers: { allow: "POST", ...corsHeaders() } },
  );
}
export function OPTIONS(): Response {
  return corsPreflight();
}
