/**
 * The pure heart of `meterAiCall` (db/ai-usage-store.ts): given the curated
 * config and what the provider charged, decide what gets recorded — which
 * margin applies, the raw nano-USD, and the billable nano-USD the quota meter
 * (and the guest per-agent counter) accrues. Dep-free, node-tested; the store
 * wraps this with D1 writes and swallow-everything error handling.
 */
import type { AiConfig, AiPurpose } from "../ai-config/types.ts";
import { marginPctForModel } from "../ai-config/resolve.ts";
import { billableNanoUsd, rawNanoUsd } from "../public-chat/core.ts";

export type MeterDecision = {
  marginPct: number;
  rawNanoUsd: number;
  billableNanoUsd: number;
};

/**
 * Null means "record nothing": the provider reported no cost (absent, zero,
 * negative or garbage) — an un-costed turn is never invented as a $0 row.
 * Config unavailable → margin 0, so billable equals raw rather than a guess.
 */
export function decideAiMeter(
  config: AiConfig | null,
  purpose: AiPurpose,
  modelId: string | null | undefined,
  costUsd: number | undefined,
): MeterDecision | null {
  if (costUsd === undefined) return null;
  const raw = rawNanoUsd(costUsd);
  if (raw <= 0) return null;
  const marginPct = marginPctForModel(config, purpose, modelId);
  return { marginPct, rawNanoUsd: raw, billableNanoUsd: billableNanoUsd(costUsd, marginPct) };
}
