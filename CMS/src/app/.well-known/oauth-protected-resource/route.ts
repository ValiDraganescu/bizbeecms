/** RFC 9728 protected-resource metadata for /mcp (cms-mcp → OAuth). */
import { protectedResourceMetadata } from "@/lib/oauth/core";
import { corsHeaders, corsPreflight } from "@/lib/oauth/guard";
import { issuerFromRequest } from "@/lib/oauth/issuer";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return Response.json(protectedResourceMetadata(await issuerFromRequest(request)), {
    headers: { ...corsHeaders(), "cache-control": "public, max-age=300" },
  });
}
export function OPTIONS(): Response {
  return corsPreflight();
}
