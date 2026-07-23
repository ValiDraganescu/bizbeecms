/**
 * Cached curated-config read — STUB. The cms-config slice (W1-B) replaces
 * this body with the real implementation: `site_settings` key `ai_config`
 * (JSON `{ fetchedAt, config }`), 15-min lazy TTL refresh from
 * `GET {PM_ORIGIN}/api/cms/ai-config?siteId={SITE_ID}` with
 * `Bearer CMS_AUTH_SECRET`, stale-serving on fetch failure. See
 * docs/ai-cost-quotas-contracts.md Contract B.
 *
 * Null means "config unavailable" — callers fall back to legacy behavior
 * (default models, margin 0, no quota enforcement).
 */
import type { AiConfig } from "./types.ts";

export async function getAiConfig(): Promise<AiConfig | null> {
  return null;
}
