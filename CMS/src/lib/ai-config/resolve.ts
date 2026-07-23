/**
 * Pure alias-resolution helpers over the curated AI config — no I/O, no deps
 * (tested in resolve.test.ts). Contract B in docs/ai-cost-quotas-contracts.md.
 *
 * Stored model values may be either an alias `key` (the new world) or a raw
 * OpenRouter model id persisted before curation existed — both resolve.
 */
import type { AiConfig, AiPurpose, CuratedModel } from "./types.ts";

/**
 * Resolve a site-stored model value to a curated entry.
 * Match order: alias key → legacy raw model id → purpose default (first
 * entry). Null when the config is unavailable or the purpose list is empty —
 * callers then fall back to the legacy DEFAULT_* model with margin 0.
 */
export function resolveModelForPurpose(
  config: AiConfig | null,
  purpose: AiPurpose,
  storedValue?: string | null,
): CuratedModel | null {
  const models = config?.purposes[purpose]?.models ?? [];
  if (models.length === 0) return null;
  if (storedValue) {
    const byKey = models.find((m) => m.key === storedValue);
    if (byKey) return byKey;
    const byModel = models.find((m) => m.model === storedValue);
    if (byModel) return byModel;
  }
  return models[0];
}

/**
 * Margin percent to apply when metering a call made with `modelId`:
 * the matching curated entry's margin, else the purpose default's margin,
 * else 0 (uncurated site / config unavailable — meter at raw cost).
 */
export function marginPctForModel(
  config: AiConfig | null,
  purpose: AiPurpose,
  modelId?: string | null,
): number {
  const entry = resolveModelForPurpose(config, purpose, modelId);
  const pct = entry?.marginPct;
  return typeof pct === "number" && Number.isFinite(pct) && pct >= 0 ? pct : 0;
}
