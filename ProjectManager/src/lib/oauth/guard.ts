/**
 * Bearer-token guard for `/mcp` (pm-mcp Slice 2). MCP requests carry no cookie;
 * they present `Authorization: Bearer at_…` minted by our own token endpoint.
 * Resolves token → grant → owning `User`; fail-closed. On denial the caller
 * answers 401 with the RFC 9728 `WWW-Authenticate` challenge so the client
 * discovers our authorization server and starts the OAuth flow.
 */
import type { User } from "@/db/schema";
import { findUserById } from "@/lib/auth/user";
import { parseBearer, wwwAuthenticate } from "./core";
import { findActiveAccessToken } from "./store";
import { issuerFromRequest } from "./issuer";

export type BearerDecision =
  | { allow: true; user: User; grantId: string; scope: string }
  | { allow: false; reason: "noToken" | "invalidToken" | "error" };

export async function checkBearer(request: Request): Promise<BearerDecision> {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return { allow: false, reason: "noToken" };
  try {
    const grant = await findActiveAccessToken(token);
    if (!grant) return { allow: false, reason: "invalidToken" };
    const user = await findUserById(grant.userId);
    if (!user) return { allow: false, reason: "invalidToken" };
    return { allow: true, user, grantId: grant.id, scope: grant.scope };
  } catch {
    return { allow: false, reason: "error" };
  }
}

/** The 401 that kicks an MCP client into the OAuth discovery flow. */
export async function unauthorized(
  request: Request,
  reason: "noToken" | "invalidToken" | "error",
): Promise<Response> {
  const issuer = await issuerFromRequest(request);
  const challenge =
    reason === "noToken"
      ? wwwAuthenticate(issuer)
      : wwwAuthenticate(issuer, "invalid_token", "the access token is missing, expired, or revoked");
  return Response.json(
    { error: reason === "noToken" ? "unauthorized" : "invalid_token" },
    { status: 401, headers: { "www-authenticate": challenge, ...corsHeaders() } },
  );
}

/**
 * CORS for the OAuth + MCP endpoints: browser-based MCP clients (claude.ai,
 * MCP Inspector) fetch metadata / register / token / mcp cross-origin. Tokens
 * ride in headers (never cookies), so a permissive origin is safe here.
 */
export function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
    "access-control-expose-headers": "www-authenticate, mcp-protocol-version",
    "access-control-max-age": "86400",
  };
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
