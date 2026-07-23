/**
 * Server-side OpenRouter catalog loader (extracted from `GET /api/chat/models`
 * so the curated-aliases route can price aliases from the same cache).
 *
 * One D1 `site_settings` row caches the parsed catalog; reads lazily refresh it
 * when older than ~12h, serve the stale copy when OpenRouter is unreachable, and
 * fall back to the static `CHAT_MODELS` so callers NEVER see an empty catalog.
 * CF-coupled (env + D1) — the pure parsing lives in `models.ts`.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { parseModelCatalog, CHAT_MODELS, type CatalogModel } from "@/lib/chat/models";
import { getModelCatalogCache, setModelCatalogCache } from "@/db/settings-store";

/** Refresh the cache after this many ms (12h — "once or twice a day"). */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** OpenRouter's public model catalog endpoint. */
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export interface LoadedCatalog {
  models: ReadonlyArray<CatalogModel>;
  fetchedAt: number;
  source: "cache" | "live" | "stale" | "static";
}

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

/**
 * The catalog, from the freshest source available: fresh cache → live fetch
 * (cached best-effort) → stale cache → static fallback. Never throws, never
 * empty.
 */
export async function loadModelCatalog(): Promise<LoadedCatalog> {
  let cache: Awaited<ReturnType<typeof getModelCatalogCache>> = null;
  try {
    cache = await getModelCatalogCache();
  } catch {
    // No D1 → treat as uncached; the live fetch below may still work.
  }
  if (cache && Date.now() - cache.fetchedAt < MAX_AGE_MS) {
    return { models: cache.models, fetchedAt: cache.fetchedAt, source: "cache" };
  }

  const live = await fetchLiveCatalog();
  if (live) {
    const fetchedAt = Date.now();
    try {
      await setModelCatalogCache({ fetchedAt, models: live });
    } catch {
      // Cache write is best-effort; still serve what we fetched.
    }
    return { models: live, fetchedAt, source: "live" };
  }

  if (cache) {
    return { models: cache.models, fetchedAt: cache.fetchedAt, source: "stale" };
  }
  return { models: CHAT_MODELS, fetchedAt: 0, source: "static" };
}
