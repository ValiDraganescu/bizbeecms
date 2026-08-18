/** RFC 7009 token revocation (cms-mcp → OAuth). Always 200 (spec) — idempotent. */
import { corsHeaders, corsPreflight } from "@/lib/oauth/guard";
import { revokeByToken } from "@/lib/oauth/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let token: string | null = null;
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      token = ((await request.json()) as { token?: unknown })?.token as string | null;
    } else {
      token = new URLSearchParams(await request.text()).get("token");
    }
  } catch {
    /* fall through */
  }
  if (typeof token === "string" && token) await revokeByToken(token);
  return new Response(null, { status: 200, headers: corsHeaders() });
}
export function OPTIONS(): Response {
  return corsPreflight();
}
