/**
 * RFC 7591 dynamic client registration (pm-mcp Slice 2). Open (no auth) as the
 * MCP spec expects: a client registers its name + redirect URIs and gets a
 * public client_id. Only public clients (PKCE) — no secrets are minted. Abuse
 * surface is small (a row per registration; redirect URIs are validated).
 */
import { parseRegistration, registrationResponse } from "@/lib/oauth/core";
import { corsHeaders, corsPreflight } from "@/lib/oauth/guard";
import { createClient } from "@/lib/oauth/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_client_metadata", error_description: "body must be JSON" },
      { status: 400, headers: corsHeaders() },
    );
  }
  const parsed = parseRegistration(body);
  if (!parsed.ok) {
    return Response.json(
      { error: parsed.error, error_description: parsed.description },
      { status: 400, headers: corsHeaders() },
    );
  }
  const client = await createClient(parsed.value.clientName, parsed.value.redirectUris);
  return Response.json(registrationResponse(client), { status: 201, headers: corsHeaders() });
}
export function OPTIONS(): Response {
  return corsPreflight();
}
