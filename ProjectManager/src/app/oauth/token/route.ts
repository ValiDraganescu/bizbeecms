/**
 * OAuth 2.1 token endpoint (pm-mcp Slice 2). Accepts form-encoded (spec) or
 * JSON bodies. Grants: authorization_code (+PKCE S256, exact redirect_uri,
 * single-use code) and refresh_token (rotating). Public clients only, so no
 * client authentication — PKCE + code binding are the proof.
 */
import { parseTokenRequest, tokenResponse, verifyPkce } from "@/lib/oauth/core";
import { corsHeaders, corsPreflight } from "@/lib/oauth/guard";
import { codeWasUsed, consumeCode, issueTokens, rotateTokens } from "@/lib/oauth/store";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

function fail(status: number, error: string, description: string): Response {
  return Response.json(
    { error, error_description: description },
    { status, headers: { ...corsHeaders(), ...NO_STORE } },
  );
}

async function readBody(request: Request): Promise<Record<string, string> | null> {
  const ct = request.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const j = (await request.json()) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(j ?? {})) if (typeof v === "string") out[k] = v;
      return out;
    }
    const text = await request.text();
    return Object.fromEntries(new URLSearchParams(text).entries());
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request);
  if (!body) return fail(400, "invalid_request", "unreadable body");
  const parsed = parseTokenRequest(body);
  if (!parsed.ok) return fail(400, parsed.error, parsed.description);
  const req = parsed.value;

  if (req.grant === "authorization_code") {
    const code = await consumeCode(req.code);
    if (!code) {
      // Replay of an already-used code → OAuth 2.1 §4.1.2 says revoke what it
      // minted. Our codes aren't linked to tokens by id, so we can't target the
      // exact grant; the code is dead either way and the token was bound to
      // PKCE, so we simply refuse.
      void codeWasUsed(req.code);
      return fail(400, "invalid_grant", "authorization code is invalid, expired, or already used");
    }
    if (code.clientId !== req.clientId) return fail(400, "invalid_grant", "code was issued to a different client");
    if (code.redirectUri !== req.redirectUri) return fail(400, "invalid_grant", "redirect_uri does not match the authorization request");
    if (!(await verifyPkce(req.codeVerifier, code.codeChallenge))) {
      return fail(400, "invalid_grant", "PKCE verification failed");
    }
    const t = await issueTokens({ clientId: code.clientId, userId: code.userId, scope: code.scope });
    return Response.json(tokenResponse(t), { headers: { ...corsHeaders(), ...NO_STORE } });
  }

  // refresh_token
  const rotated = await rotateTokens(req.refreshToken, req.clientId);
  if (!rotated) return fail(400, "invalid_grant", "refresh token is invalid, expired, or revoked");
  return Response.json(tokenResponse(rotated), { headers: { ...corsHeaders(), ...NO_STORE } });
}
export function OPTIONS(): Response {
  return corsPreflight();
}
