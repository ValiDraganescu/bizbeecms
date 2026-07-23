/**
 * The set of model values a settings route may PERSIST for a purpose
 * (ai-cost-quotas W2-E). Pure, no `@/` imports — node-testable.
 *
 * The media settings routes validate an untrusted `{ model }` against an
 * allowlist built from the raw OpenRouter catalog. Curated alias keys are not
 * catalog ids, so they would be rejected and silently rewritten to the legacy
 * default. Rather than branching each route on "is this an alias?", we simply
 * WIDEN the allowlist with the purpose's alias keys: the existing
 * `resolve*Model(value, allowed)` discipline then accepts an alias key, a legacy
 * raw catalog id, or falls back to the default — unchanged for uncurated sites.
 */
import type { AiConfig, AiPurpose } from "./types.ts";

export function allowedModelValues(
  config: AiConfig | null,
  purpose: AiPurpose,
  catalogIds: Iterable<string>,
): Set<string> {
  const allowed = new Set(catalogIds);
  for (const m of config?.purposes[purpose]?.models ?? []) {
    allowed.add(m.key); // the curated alias key — what pickers now store
    allowed.add(m.model); // its model id, so a curated model is never rejected
  }
  return allowed;
}
