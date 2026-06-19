/**
 * AI model catalog endpoint (ai-assistant goal — searchable model picker).
 *
 *   GET /api/chat/models  → { models: CatalogModel[], fetchedAt, source }
 *
 * Serves the FULL Cloudflare Workers-AI catalog for the picker. The catalog is
 * CACHED in D1 (one `site_settings` row) and lazily REFRESHED on read when the
 * cache is older than ~12h (ponytail: lazy refresh, no Cron — add a scheduled
 * handler only if this proves too laggy). The live fetch hits Cloudflare's
 * list-models API with `env.CF_ACCOUNT_ID` + `env.CF_API_TOKEN`; when those
 * aren't provisioned (or the fetch fails) we fall back to the static
 * `CHAT_MODELS` allowlist so the picker is NEVER empty.
 *
 * SCOPE: this returns Workers-AI models only (`@cf/...`) — the CF API exposes no
 * multi-provider AI-Gateway catalog. Those, if wanted later, are a small curated
 * supplement merged on top (not built here).
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

/** Fetch + parse the live CF catalog, or null when creds/fetch unavailable. */
async function fetchLiveCatalog(): Promise<CatalogModel[] | null> {
  let accountId = "";
  let apiToken = "";
  try {
    const { env } = await getCloudflareContext({ async: true });
    // CF_ACCOUNT_ID / CF_API_TOKEN are injected per-Site by the deployer (same
    // creds the binding-adapters REST `Ai` task uses); absent in local/default.
    const e = env as unknown as Record<string, unknown>;
    accountId = String(e.CF_ACCOUNT_ID ?? "");
    apiToken = String(e.CF_API_TOKEN ?? "");
  } catch {
    return null;
  }
  if (!accountId || !apiToken) return null;

  const url =
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search` +
    `?task=Text+Generation&hide_experimental=true&per_page=100`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
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
