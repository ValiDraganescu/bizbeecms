/**
 * AI usage settings page — PURE key-building + aggregation over `usage_counter`
 * rows (ai-usage-settings-page). Dep-free (relative `.ts` imports only) so it
 * runs under `node --test`; `db/ai-usage-store.ts` owns the D1 reads/writes and
 * composes these helpers.
 *
 * Key schemes this module speaks (all integer nano-USD counts):
 *
 *   ai:<YYYY-MM>:billable      monthly billable meter (Contract C — NOT ours,
 *                              only summed here for the all-time total)
 *   ai:d:<YYYY-MM-DD>:<purpose>  daily per-purpose BILLABLE spend, UTC day —
 *                              THE one new scheme this feature adds
 *
 * Aggregation is strict: only keys matching a scheme exactly count, so a chat
 * counter, a `:raw` meter or a future key can never leak into a total.
 */
import { AI_PURPOSES, type AiPurpose } from "../ai-config/types.ts";

/** One `usage_counter` row as the store reads it. */
export type CounterRow = { key: string; count: number };

/** How many days the daily view shows (today + 29 before it). */
export const DAILY_VIEW_DAYS = 30;

/**
 * The UTC `YYYY-MM-DD` bucket an AI call's daily meter lands in. UTC everywhere
 * (like `aiUsageMonth`) so a Worker's timezone can never split one day in two.
 */
export function aiUsageDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The daily per-purpose billable counter key for a UTC day. */
export function dailyPurposeKey(day: string, purpose: AiPurpose): string {
  return `ai:d:${day}:${purpose}`;
}

/** The last `n` UTC day buckets ending at `now`'s day, oldest first. */
export function lastDays(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    aiUsageDay(
      new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - (n - 1 - i),
        ),
      ),
    ),
  );
}

/**
 * The SQL LIKE patterns (`ai:d:<YYYY-MM>-%`) whose union covers every daily
 * key the summary needs: enough trailing days for BOTH the 30-day view and the
 * whole current month to date (a 31st-of-the-month "last 30 days" window would
 * otherwise miss the 1st) — at most two month prefixes. Prefix reads instead of
 * exact keys because the exact set is 150+ keys and D1 caps bound parameters
 * per query at ~100; the patterns over-fetch a few extra days of the oldest
 * month, which `aggregateDailyUsage` strictly ignores.
 */
export function dailyMonthPatterns(now: Date): string[] {
  const span = Math.max(DAILY_VIEW_DAYS, now.getUTCDate());
  const months = new Set(lastDays(now, span).map((day) => day.slice(0, 7)));
  return [...months].map((month) => `ai:d:${month}-%`);
}

/** A daily per-purpose key, parsed — or null for anything else. */
const DAILY_KEY_RE = /^ai:d:(\d{4}-\d{2}-\d{2}):([a-zA-Z]+)$/;

export interface DailyAiUsage {
  /** The 30-day view, oldest first, today last; zero-filled (never absent). */
  days: Array<{ day: string; nanoUsd: number }>;
  /** Current month's spend per purpose, catalog order, zeros included. */
  purposes: Array<{ purpose: AiPurpose; nanoUsd: number }>;
}

/**
 * Fold the batch-read daily counter rows into the two page sections: the
 * last-30-days series (per-day sum across purposes) and the current month's
 * per-purpose totals (month-prefixed days only). Rows whose key is not a
 * well-formed daily key with a known purpose are ignored, and days the read
 * happened to cover beyond either window don't leak in.
 */
export function aggregateDailyUsage(rows: CounterRow[], now: Date): DailyAiUsage {
  const viewDays = lastDays(now, DAILY_VIEW_DAYS);
  const monthPrefix = `${aiUsageDay(now).slice(0, 7)}-`;

  const byDay = new Map<string, number>(viewDays.map((d) => [d, 0]));
  const byPurpose = new Map<AiPurpose, number>(AI_PURPOSES.map((p) => [p, 0]));

  for (const { key, count } of rows) {
    const m = DAILY_KEY_RE.exec(key);
    if (!m || !Number.isFinite(count)) continue;
    const [, day, purpose] = m;
    if (!byPurpose.has(purpose as AiPurpose)) continue; // unknown purpose — skip
    if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + count);
    if (day.startsWith(monthPrefix)) {
      byPurpose.set(purpose as AiPurpose, (byPurpose.get(purpose as AiPurpose) ?? 0) + count);
    }
  }

  return {
    days: viewDays.map((day) => ({ day, nanoUsd: byDay.get(day) ?? 0 })),
    purposes: AI_PURPOSES.map((purpose) => ({
      purpose,
      nanoUsd: byPurpose.get(purpose) ?? 0,
    })),
  };
}

/** Exactly a monthly billable meter key — never `:raw`, never a daily key. */
const MONTHLY_BILLABLE_RE = /^ai:\d{4}-\d{2}:billable$/;

/**
 * All-time billable spend: the sum of every `ai:<YYYY-MM>:billable` monthly
 * meter. Works retroactively — months metered before this feature existed
 * already have their counter. The store feeds this a `LIKE 'ai:%:billable'`
 * read; the strict match here is what guarantees nothing else ever sums in.
 */
export function sumAllTimeBillable(rows: CounterRow[]): number {
  let total = 0;
  for (const { key, count } of rows) {
    if (MONTHLY_BILLABLE_RE.test(key) && Number.isFinite(count)) total += count;
  }
  return total;
}

/**
 * Nano-USD → USD at 6 decimals — the wire unit for the daily / per-purpose /
 * all-time figures, where a single call is often sub-cent and the credit chip's
 * round-to-cents would flatten real spend to 0.
 */
export function usdFromNanoFine(nanoUsd: number): number {
  return Math.round(nanoUsd / 1000) / 1_000_000;
}

/**
 * Display formatter for a fine USD amount (mirrors `formatUsdFromNano`'s
 * ladder, but over the wire's USD unit): cents and up → "$1.23"; sub-cent →
 * four decimals; nonzero below $0.0001 → "<$0.0001"; exact zero → "$0".
 */
export function formatUsdAmount(usd: number): string {
  if (usd === 0) return "$0";
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  if (usd >= 0.0001) return `$${usd.toFixed(4)}`;
  return "<$0.0001";
}
