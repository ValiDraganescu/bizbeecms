import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { parseModelCatalog } from "@/lib/ai/model-catalog";

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
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "SuperAdmin" && user.role !== "Admin")) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  try {
    const res = await fetch(OPENROUTER_MODELS_URL);
    if (!res.ok) {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }
    const models = parseModelCatalog(await res.json());
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
