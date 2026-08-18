import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { canCurateAiModels } from "@/lib/ai/curated";
import { fetchOpenRouterCatalog } from "@/lib/ai/openrouter-catalog";

/**
 * OpenRouter model catalog, for the curation page's model picker. A thin
 * admin-gated proxy over the PUBLIC catalog endpoint (no API key involved) —
 * the browser can't call it directly without leaking PM's origin into a CORS
 * dance, and the gate keeps a large upstream response off unauthenticated PM
 * traffic.
 *
 * GET → { models: CatalogModel[] } (parsed + filtered like the CMS picker's
 * catalog: label, provider, per-token prices, modalities, context window).
 * Upstream failure → 502; the client falls back to free-text entry.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || !canCurateAiModels(user.role)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }
  try {
    const models = await fetchOpenRouterCatalog();
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
