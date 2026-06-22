/**
 * API-key auth guard for the remote MCP server (cms-mcp Slice 2). This is the
 * SECOND, SEPARATE guard path — the browser chat + admin surface stay on the
 * cookie/SSO guard (`guard.ts requireAdmin`). MCP requests carry NO cookie; they
 * present `Authorization: Bearer bzb_…`.
 *
 * Flow: parse the bearer → shape-check (`looksLikeKey`) → SHA-256 hash (pure) →
 * D1 lookup of a NON-revoked row by hash → allow/deny. Fail-closed: missing
 * header, wrong shape, unknown/revoked key, or any error all DENY. The plaintext
 * key is never logged or stored; only its hash ever touches the DB.
 */
import { hashKey, looksLikeKey, parseBearer } from "./api-key-core.ts";
import { findActiveKeyByHash } from "../../db/api-key-store.ts";

export type ApiKeyDecision =
  | { allow: true; keyId: string }
  | { allow: false; reason: "noKey" | "badShape" | "unknown" | "error" };

/** Authorize an incoming MCP `Request` by its bearer API key. */
export async function checkApiKey(request: Request): Promise<ApiKeyDecision> {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return { allow: false, reason: "noKey" };
  if (!looksLikeKey(token)) return { allow: false, reason: "badShape" };
  try {
    const row = await findActiveKeyByHash(await hashKey(token));
    if (!row) return { allow: false, reason: "unknown" };
    return { allow: true, keyId: row.id };
  } catch {
    return { allow: false, reason: "error" };
  }
}

/**
 * Guard an MCP route. Returns a 401 `Response` to short-circuit an
 * unauthenticated/invalid request, or `null` to proceed.
 *
 *   const denied = await requireApiKey(request);
 *   if (denied) return denied;
 */
export async function requireApiKey(request: Request): Promise<Response | null> {
  const decision = await checkApiKey(request);
  if (decision.allow) return null;
  return Response.json(
    { error: "unauthorized", reason: decision.reason },
    { status: 401, headers: { "www-authenticate": "Bearer" } },
  );
}
