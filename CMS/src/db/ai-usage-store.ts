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
 * The month in the key IS the monthly reset (no cron, no job). All bumps use
 * the atomic `incrementCounter` upsert, so concurrent calls never lose a turn.
 *
 * The settings usage page (ai-usage-settings-page) adds a THIRD counter per
 * call, billable only, bucketed by UTC day and purpose:
 *
 *   ai:d:<YYYY-MM-DD>:<purpose>  daily billable spend per purpose
 *
 * It powers the last-30-days series and the per-purpose month breakdown (key
 * builders + aggregation live in the pure lib/ai-usage/summary.ts). The
 * monthly keys — the PM contract — are untouched; daily data simply starts
 * accruing at the release that introduced the key.
 *
 * Metering must NEVER fail or delay a user-facing AI call: `meterAiCall` is the
 * one entry point call sites use and it swallows everything (missing config,
 * unbound D1, absent cost). What gets recorded is decided by the pure
 * `decideAiMeter` (lib/ai-quota/decision.ts, node-tested); this file is only
 * the D1 seam. All counters bump together (atomic upserts, run in parallel)
 * so raw, billable and the daily meter can't drift by a call.
 */
import { getAiConfig, type AiPurpose } from "../lib/ai-config/index.ts";
import { decideAiMeter } from "../lib/ai-quota/decision.ts";
import {
  aggregateDailyUsage,
  aiUsageDay,
  dailyMonthPatterns,
  dailyPurposeKey,
  sumAllTimeBillable,
  type DailyAiUsage,
} from "../lib/ai-usage/summary.ts";
import { aiUsageMonth, quotaExceeded } from "../lib/public-chat/core.ts";
import { getCounter, incrementCounter, readCountersLike } from "./usage-counter-store.ts";

/** The two counter keys for a UTC month bucket. */
function monthKeys(now: Date): { month: string; raw: string; billable: string } {
  const month = aiUsageMonth(now);
  return { month, raw: `ai:${month}:raw`, billable: `ai:${month}:billable` };
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
  try {
    const decision = decideAiMeter(await getAiConfig(), purpose, modelId, costUsd);
    if (!decision) return 0;
    const now = new Date();
    const keys = monthKeys(now);
    await Promise.all([
      incrementCounter(keys.raw, decision.rawNanoUsd),
      incrementCounter(keys.billable, decision.billableNanoUsd),
      // The settings page's daily/per-purpose meter — billable, UTC day bucket.
      incrementCounter(dailyPurposeKey(aiUsageDay(now), purpose), decision.billableNanoUsd),
    ]);
    return decision.billableNanoUsd;
  } catch {
    return 0; // metering is best-effort — never surfaces to the caller
  }
}

/** This month's spend against the Site's quota (Contract D). */
export interface AiQuotaStatus {
  /** May another AI call be made? False only when a quota exists and is spent. */
  ok: boolean;
  /** This month's BILLABLE spend, integer nano-USD. */
  usedNanoUsd: number;
  /** The Site's monthly quota in customer USD; null when none is configured. */
  quotaUsd: number | null;
}

/**
 * THE quota gate — every AI entry point calls this BEFORE the model call and
 * refuses (429 / tool error) when `ok` is false. Also the one read behind the
 * credit chip and the PM usage endpoint, so all three always agree.
 *
 * SOFT quota by design: the check happens once per request, so a turn already
 * in flight may overshoot. The circuit breaker on the OpenRouter key (Contract
 * F) is what bounds real spend; this bounds the customer's bill.
 *
 * Fails OPEN. No quota configured, an unreachable curated config, or an unbound
 * D1 all yield `ok: true` — a Site whose PM is down keeps answering visitors
 * rather than going dark on an unknown quota (docs/ai-cost-quotas.md).
 */
export async function checkAiQuota(now: Date = new Date()): Promise<AiQuotaStatus> {
  try {
    const [config, usage] = await Promise.all([
      getAiConfig(),
      readMonthlyAiUsage(now),
    ]);
    const quotaUsd = config?.quota.monthlyUsd ?? null;
    return {
      ok: !quotaExceeded(usage.billableNanoUsd, quotaUsd),
      usedNanoUsd: usage.billableNanoUsd,
      quotaUsd,
    };
  } catch {
    return { ok: true, usedNanoUsd: 0, quotaUsd: null };
  }
}

/**
 * All-time billable spend (integer nano-USD): every `ai:<YYYY-MM>:billable`
 * monthly meter summed — retroactive by construction, since months metered
 * before the settings page existed already have their counter. One LIKE
 * prefilter read; the strict per-key match lives in the pure
 * `sumAllTimeBillable`, so `:raw` meters and daily keys can never sum in.
 */
export async function readAllTimeBillableNanoUsd(): Promise<number> {
  return sumAllTimeBillable(await readCountersLike("ai:%:billable"));
}

/**
 * The settings page's daily sections from the `ai:d:<day>:<purpose>` meters:
 * the last-30-days billable series (zero-filled, today last) and the current
 * month's per-purpose totals. At most two month-prefix LIKE reads (exact keys
 * would need 150+ bound params — over D1's per-query cap); the strict fold is
 * the pure `aggregateDailyUsage`. Days before the daily meter shipped read as 0.
 */
export async function readDailyAiUsage(now: Date = new Date()): Promise<DailyAiUsage> {
  const rows = await Promise.all(dailyMonthPatterns(now).map((p) => readCountersLike(p)));
  return aggregateDailyUsage(rows.flat(), now);
}
