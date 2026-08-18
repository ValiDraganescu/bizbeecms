/** RFC 8414 authorization-server metadata (cms-mcp → OAuth). Public, CORS-open. */
import { authorizationServerMetadata } from "@/lib/oauth/core";
import { corsHeaders, corsPreflight } from "@/lib/oauth/guard";
import { issuerFromRequest } from "@/lib/oauth/issuer";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return Response.json(authorizationServerMetadata(await issuerFromRequest(request)), {
    headers: { ...corsHeaders(), "cache-control": "public, max-age=300" },
  });
}
export function OPTIONS(): Response {
  return corsPreflight();
}
