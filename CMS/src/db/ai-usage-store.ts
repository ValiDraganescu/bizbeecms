/**
 * Monthly AI spend meter (ai-cost-quotas, Contract C in
 * docs/ai-cost-quotas-contracts.md).
 *
 * Every AI call the CMS makes reports what OpenRouter actually charged
 * (`usage.cost`, USD). We accrue that into two `usage_counter` keys, in integer
 * nano-USD, bucketed by UTC month:
 *
 *   ai:<YYYY-MM>:raw       provider cost — PM reconciles this against OpenRouter
 *   ai:<YYYY-MM>:billable  cost × (1 + margin%) — THE customer-facing quota meter
 *
 * The month in the key IS the monthly reset (no cron, no job). Both bumps use
 * the atomic `incrementCounter` upsert, so concurrent calls never lose a turn.
 *
 * Metering must NEVER fail or delay a user-facing AI call: `meterAiCall` is the
 * one entry point call sites use and it swallows everything (missing config,
 * unbound D1, absent cost). The money math + month derivation are pure helpers
 * in `lib/public-chat/core.ts` (node-tested); this file is only the D1 seam.
 */
import { getAiConfig, marginPctForModel, type AiPurpose } from "../lib/ai-config/index.ts";
import {
  aiUsageMonth,
  billableNanoUsd,
  rawNanoUsd,
} from "../lib/public-chat/core.ts";
import { getCounter, incrementCounter } from "./usage-counter-store.ts";

/** The two counter keys for a UTC month bucket. */
function monthKeys(now: Date): { month: string; raw: string; billable: string } {
  const month = aiUsageMonth(now);
  return { month, raw: `ai:${month}:raw`, billable: `ai:${month}:billable` };
}

/**
 * Accrue one AI call's provider cost into the current month's raw + billable
 * counters. No-op when the provider reported no cost (`costUsd <= 0`) — an
 * un-costed turn is recorded as nothing rather than a fabricated $0.
 */
export async function recordAiUsage(
  costUsd: number,
  marginPct: number,
  now: Date = new Date(),
): Promise<void> {
  const raw = rawNanoUsd(costUsd);
  if (raw <= 0) return;
  const billable = billableNanoUsd(costUsd, marginPct);
  const keys = monthKeys(now);
  // Both counters bump together (independent atomic upserts, run in parallel) so
  // raw and billable can't drift by a call.
  await Promise.all([
    incrementCounter(keys.raw, raw),
    incrementCounter(keys.billable, billable),
  ]);
}

/** This month's metered spend (both counters, integer nano-USD; 0 when unused). */
export async function readMonthlyAiUsage(
  now: Date = new Date(),
): Promise<{ month: string; billableNanoUsd: number; rawNanoUsd: number }> {
  const keys = monthKeys(now);
  const [billable, raw] = await Promise.all([
    getCounter(keys.billable),
    getCounter(keys.raw),
  ]);
  return { month: keys.month, billableNanoUsd: billable, rawNanoUsd: raw };
}

/**
 * Resolve the curated margin for `modelId` under `purpose` and record the call.
 * THE entry point for every AI call site: one await, no config plumbing at the
 * call site, and every failure path (config unavailable, unbound D1) is
 * swallowed here so metering can never break the user's request. A config the
 * CMS can't reach means margin 0 — billable then equals raw, never a guess.
 *
 * Returns the billable nano-USD it recorded, or 0 when nothing was metered (no
 * cost reported, or the write failed) — a caller with its OWN cost counter (the
 * per-agent guest-chat one) reuses that number instead of re-deriving it, and a
 * failed meter under-reports rather than inventing a figure.
 *
 * Never rejects; call sites still `.catch(() => {})` it as fire-and-forget so
 * the guarantee holds even if this ever starts propagating.
 */
export async function meterAiCall(
  purpose: AiPurpose,
  modelId: string | null | undefined,
  costUsd: number | undefined,
): Promise<number> {
  if (costUsd === undefined || rawNanoUsd(costUsd) <= 0) return 0;
  try {
    const config = await getAiConfig();
    const marginPct = marginPctForModel(config, purpose, modelId);
    await recordAiUsage(costUsd, marginPct);
    return billableNanoUsd(costUsd, marginPct);
  } catch {
    return 0; // metering is best-effort — never surfaces to the caller
  }
}
