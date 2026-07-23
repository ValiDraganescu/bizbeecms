/**
 * Cached read of the PM-curated AI config (Contract B in
 * docs/ai-cost-quotas-contracts.md). The config lives in ONE `site_settings`
 * row (`ai_config` → `{ fetchedAt, config }`) and is refreshed lazily on read
 * once it is older than 15 min — same shape as the model-catalog cache, but
 * with the TTL INSIDE this function so every caller gets freshness for free.
 *
 * Availability rules (config is on the hot path of every AI call, so it must
 * never break one):
 *   - the cache is replaced ONLY by a successful, well-formed PM fetch;
 *   - any failure (missing env, network, non-200, bad shape) serves the stale
 *     cache when there is one;
 *   - nothing here throws — null means "config unavailable" and callers fall
 *     back to legacy behavior (default models, margin 0, no quota enforcement).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAiConfigCache, setAiConfigCache } from "@/db/settings-store";
import { parseAiConfig, isAiConfigFresh, type AiConfigCache } from "./parse.ts";
import type { AiConfig } from "./types.ts";

/** The PM→CMS machine credentials, or null when this Worker lacks any of them. */
async function readEnv(): Promise<
  { pmOrigin: string; siteId: string; secret: string } | null
> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as Record<string, unknown>;
    const pmOrigin = typeof e.PM_ORIGIN === "string" ? e.PM_ORIGIN : "";
    const siteId = typeof e.SITE_ID === "string" ? e.SITE_ID : "";
    const secret = typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
    if (!pmOrigin || !siteId || !secret) return null;
    return { pmOrigin: pmOrigin.replace(/\/+$/, ""), siteId, secret };
  } catch {
    // No CF context (local dev without bindings) → behave as "not configured".
    return null;
  }
}

/** GET the curated config from PM (Contract A), or null on any failure. */
async function fetchAiConfig(): Promise<AiConfig | null> {
  const env = await readEnv();
  if (!env) return null;
  try {
    const url = `${env.pmOrigin}/api/cms/ai-config?siteId=${encodeURIComponent(env.siteId)}`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${env.secret}` },
    });
    if (!res.ok) return null;
    return parseAiConfig(await res.json());
  } catch {
    return null;
  }
}

/** Read the stored row; a D1 hiccup is just "no cache", never an exception. */
async function readCache(): Promise<AiConfigCache | null> {
  try {
    return await getAiConfigCache();
  } catch {
    return null;
  }
}

/**
 * The curated AI config for this Site, or null when it has never been fetched
 * successfully. The first read past the TTL pays for the refresh.
 */
export async function getAiConfig(): Promise<AiConfig | null> {
  const cached = await readCache();
  if (cached && isAiConfigFresh(cached.fetchedAt, Date.now())) return cached.config;

  const fresh = await fetchAiConfig();
  if (!fresh) return cached?.config ?? null;

  try {
    await setAiConfigCache({ fetchedAt: Date.now(), config: fresh });
  } catch {
    // Cache write is best-effort; still serve what we just fetched.
  }
  return fresh;
}
