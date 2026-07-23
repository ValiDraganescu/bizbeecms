/**
 * AI model catalog endpoint (ai-openrouter goal — searchable model picker).
 *
 *   GET /api/chat/models  → { models: CatalogModel[], fetchedAt, source }
 *
 * Serves the OpenRouter catalog for the picker. All the cache/refresh/fallback
 * logic lives in `lib/chat/catalog-loader.ts` (shared with the curated-aliases
 * route, which prices aliases from the same cache): D1-cached, lazily refreshed
 * after ~12h, stale-served when OpenRouter is down, static `CHAT_MODELS` as the
 * last resort — the picker is NEVER empty.
 *
 * Admin-only (it's CMS-internal config). REST-only (PM directive).
 */
import { requireAdmin } from "@/lib/auth/guard";
import { CHAT_MODELS } from "@/lib/chat/models";
import { loadModelCatalog } from "@/lib/chat/catalog-loader";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { models, fetchedAt, source } = await loadModelCatalog();
    return Response.json({ models, fetchedAt, source });
  } catch (err) {
    // Never break the picker — fall back to the static list on any error.
    return Response.json({
      models: CHAT_MODELS,
      fetchedAt: 0,
      source: "static",
      error: (err as Error).message,
    });
  }
}
