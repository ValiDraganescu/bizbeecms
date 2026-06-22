/**
 * AI model catalog endpoint (ai-openrouter goal — searchable model picker).
 *
 *   GET /api/chat/models  → { models: CatalogModel[], fetchedAt, source }
 *
 * Serves the OpenRouter catalog for the picker. The catalog is CACHED in D1 (one
 * `site_settings` row) and lazily REFRESHED on read when the cache is older than
 * ~12h (ponytail: lazy refresh, no Cron — add a scheduled handler only if this
 * proves too laggy). The live fetch hits OpenRouter's `/api/v1/models` (public,
 * but we send `env.OPENROUTER_API_KEY` as a Bearer when present — read via the
 * same env boundary the Ai port uses); when the fetch fails we fall back to the
 * static `CHAT_MODELS` allowlist so the picker is NEVER empty.
 *
 * Admin-only (it's CMS-internal config). REST-only (PM directive).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth/guard";
import { parseModelCatalog, CHAT_MODELS, type CatalogModel } from "@/lib/chat/models";
import {
  getModelCatalogCache,
  setModelCatalogCache,
} from "@/db/settings-store";

export const dynamic = "force-dynamic";

/** Refresh the cache after this many ms (12h — "once or twice a day"). */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** OpenRouter's public model catalog endpoint. */
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/** Fetch + parse the live OpenRouter catalog, or null when the fetch fails. */
async function fetchLiveCatalog(): Promise<CatalogModel[] | null> {
  // OpenRouter /api/v1/models is public; send the key as Bearer when present so
  // the call is attributed (read via the same env boundary the Ai port uses).
  let apiKey = "";
  try {
    const { env } = await getCloudflareContext({ async: true });
    apiKey = String((env as unknown as Record<string, unknown>).OPENROUTER_API_KEY ?? "");
  } catch {
    // No CF context (e.g. local dev) → still try the public endpoint un-keyed.
  }

  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) return null;
    const json = await res.json();
    const models = parseModelCatalog(json);
    return models.length > 0 ? models : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const cache = await getModelCatalogCache();
    const fresh = cache && Date.now() - cache.fetchedAt < MAX_AGE_MS;
    if (fresh) {
      return Response.json({
        models: cache!.models,
        fetchedAt: cache!.fetchedAt,
        source: "cache",
      });
    }

    // Stale or empty → try a live refresh.
    const live = await fetchLiveCatalog();
    if (live) {
      const fetchedAt = Date.now();
      try {
        await setModelCatalogCache({ fetchedAt, models: live });
      } catch {
        // Cache write is best-effort; still serve what we fetched.
      }
      return Response.json({ models: live, fetchedAt, source: "live" });
    }

    // No live fetch — serve a stale cache if we have one, else the static list.
    if (cache) {
      return Response.json({
        models: cache.models,
        fetchedAt: cache.fetchedAt,
        source: "stale",
      });
    }
    return Response.json({
      models: CHAT_MODELS,
      fetchedAt: 0,
      source: "static",
    });
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
