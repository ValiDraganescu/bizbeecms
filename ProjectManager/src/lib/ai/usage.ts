/**
 * Fleet AI usage — the pure half (`docs/ai-cost-quotas-contracts.md`, Contract F).
 *
 * Three separate concerns, all pure so they run under a bare `node --test`:
 *  1. money — usage crosses the wire as integer nano-USD; PM renders dollars;
 *  2. parsing — the two upstreams (a Site's CMS, the OpenRouter Provisioning
 *     API) are both untrusted shapes that must degrade, never throw;
 *  3. arithmetic — quota/pool ratios and the metered-vs-OpenRouter drift that is
 *     the tripwire for a metering bug.
 *
 * Dependency-free (no `@/` alias, no drizzle, no env). The fetching edge lives
 * in ./fleet.ts.
 */

/** Money at rest across PM↔CMS is integer nano-USD (design doc, shared invariants). */
export const NANO_USD_PER_USD = 1_000_000_000;

/**
 * Render nano-USD as a dollar amount. Fleet numbers are small (cents matter, so
 * do sub-cents on a quiet site) — 4 decimals shows a $0.0007 month without
 * pretending a $12.3456 one is exact. Non-finite/negative input → `$0.0000`, so
 * a corrupt counter can't render `$NaN` on the dashboard.
 */
export function formatUsdFromNano(nanoUsd: number): string {
  const usd = Number.isFinite(nanoUsd) && nanoUsd > 0 ? nanoUsd / NANO_USD_PER_USD : 0;
  return `$${usd.toFixed(4)}`;
}

/** Same, for a value already in dollars (quotas, the pool, the derived cap). */
export function formatUsd(usd: number): string {
  const safe = Number.isFinite(usd) ? usd : 0;
  return `$${safe.toFixed(2)}`;
}

/**
 * The OpenRouter key limit is a CIRCUIT BREAKER, not the meter: a generous 2.5×
 * the customer's monthly quota (design doc, "OpenRouter keys: circuit breakers,
 * not meters"). Soft enforcement in the CMS is what customers hit; this cap only
 * contains the blast radius when soft enforcement is bypassed (bug, compromise,
 * abused public agent). Rounded UP so a $1 quota still gets a usable $3 cap.
 *
 * No quota → no cap (an uncapped key, same as today's behaviour).
 */
export const CIRCUIT_BREAKER_MULTIPLIER = 2.5;

export function circuitBreakerLimitUsd(quotaUsd: number | null | undefined): number | null {
  if (quotaUsd == null || !Number.isFinite(quotaUsd)) return null;
  if (quotaUsd <= 0) return 0;
  return Math.ceil(quotaUsd * CIRCUIT_BREAKER_MULTIPLIER);
}

/** Contract D body of a Site's `GET /api/pm/ai-usage`. */
export type SiteAiUsage = {
  /** UTC `YYYY-MM` the counters belong to. */
  month: string;
  billableNanoUsd: number;
  rawNanoUsd: number;
  /** The Site's monthly quota in USD as the CMS knows it; null = no quota. */
  quotaUsd: number | null;
};

const MONTH_RE = /^\d{4}-\d{2}$/;

function nonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Parse a Site's usage response. Deliberately tolerant: a site running an older
 * CMS (or a half-deployed one) must render as a number we can show, not take the
 * whole fleet page down. A missing/garbage counter reads as 0; a missing quota
 * reads as null (= unquotaed), never 0 (= "everything is over quota").
 * Returns null only when the payload isn't an object at all.
 */
export function parseSiteAiUsage(body: unknown): SiteAiUsage | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  // Only a real number is a quota. `Number(null)`/`Number("")` are 0, and a
  // quota of 0 means "every call is over quota" — the opposite of "no quota".
  const quota = typeof b.quotaUsd === "number" ? b.quotaUsd : Number.NaN;
  return {
    month: typeof b.month === "string" && MONTH_RE.test(b.month) ? b.month : "",
    billableNanoUsd: nonNegativeInt(b.billableNanoUsd),
    rawNanoUsd: nonNegativeInt(b.rawNanoUsd),
    quotaUsd: Number.isFinite(quota) && quota >= 0 ? quota : null,
  };
}

/**
 * Pull the key's spend (USD) out of an OpenRouter `GET /api/v1/keys/{hash}`
 * response. The Provisioning API wraps the key in `data`, but the field has
 * moved before and this is a reconciliation aid, not a billing source — so we
 * accept `usage` at either level and give up quietly (null) on anything else.
 * null = "couldn't read it", which the dashboard shows as no drift signal
 * rather than as a fake $0.
 */
export function parseOpenRouterKeyUsageUsd(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const data = typeof b.data === "object" && b.data !== null ? (b.data as Record<string, unknown>) : b;
  const usage = data.usage;
  const n = typeof usage === "number" ? usage : Number(usage);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Metered-vs-OpenRouter drift for one site, in nano-USD. `reportedRawNanoUsd` is
 * what the CMS metered, `openRouterUsageUsd` what OpenRouter billed the key.
 * Null when we couldn't read the OpenRouter side — an unknown drift must not
 * look like a zero drift.
 *
 * `driftNanoUsd` is signed: positive = OpenRouter charged more than we metered
 * (missed metering, the expensive direction), negative = we over-metered.
 */
export type UsageDrift = {
  openRouterNanoUsd: number;
  driftNanoUsd: number;
  /** |drift| as a fraction of the OpenRouter figure; null when it billed $0. */
  driftRatio: number | null;
};

export function computeDrift(
  reportedRawNanoUsd: number,
  openRouterUsageUsd: number | null,
): UsageDrift | null {
  if (openRouterUsageUsd == null) return null;
  const openRouterNanoUsd = Math.round(openRouterUsageUsd * NANO_USD_PER_USD);
  const driftNanoUsd = openRouterNanoUsd - reportedRawNanoUsd;
  return {
    openRouterNanoUsd,
    driftNanoUsd,
    driftRatio:
      openRouterNanoUsd > 0 ? Math.abs(driftNanoUsd) / openRouterNanoUsd : null,
  };
}

/**
 * Drift big enough to be worth an operator's attention: more than 10% off AND
 * more than a cent in absolute terms. The absolute floor stops a $0.0001-vs-
 * $0.0002 rounding difference from crying wolf on every quiet site.
 */
export const DRIFT_ALERT_RATIO = 0.1;
export const DRIFT_ALERT_FLOOR_NANO_USD = 10_000_000; // $0.01

export function isDriftSignificant(drift: UsageDrift | null): boolean {
  if (!drift) return false;
  return (
    Math.abs(drift.driftNanoUsd) > DRIFT_ALERT_FLOOR_NANO_USD &&
    drift.driftRatio != null &&
    drift.driftRatio > DRIFT_ALERT_RATIO
  );
}

/**
 * Fraction of a quota (or the pool) consumed, 0..∞ — the caller renders it as a
 * bar and flags ≥1 as exhausted. Null quota (unset) or a zero quota has no
 * meaningful ratio, so: null.
 */
export function usageRatio(usedNanoUsd: number, quotaUsd: number | null): number | null {
  if (quotaUsd == null || quotaUsd <= 0) return null;
  return usedNanoUsd / (quotaUsd * NANO_USD_PER_USD);
}

/** One row of the fleet dashboard: either usage, or why we don't have it. */
export type FleetSiteUsage =
  | { siteId: string; name: string; slug: string; state: "ok"; usage: SiteAiUsage; drift: UsageDrift | null }
  | { siteId: string; name: string; slug: string; state: "unreachable" };

export type FleetTotals = {
  /** Sites that answered. */
  reporting: number;
  unreachable: number;
  billableNanoUsd: number;
  rawNanoUsd: number;
  /** Sum of the reporting sites' quotas; sites without one contribute 0. */
  quotaUsd: number;
  /** Fleet billable against the configured pool; null when no pool is set. */
  poolRatio: number | null;
  /** Sites whose drift crossed the alert threshold. */
  driftAlerts: number;
};

/** Fleet roll-up. Unreachable sites contribute nothing but their count. */
export function summarizeFleet(
  rows: readonly FleetSiteUsage[],
  poolUsd: number | null,
): FleetTotals {
  const totals: FleetTotals = {
    reporting: 0,
    unreachable: 0,
    billableNanoUsd: 0,
    rawNanoUsd: 0,
    quotaUsd: 0,
    poolRatio: null,
    driftAlerts: 0,
  };

  for (const row of rows) {
    if (row.state === "unreachable") {
      totals.unreachable += 1;
      continue;
    }
    totals.reporting += 1;
    totals.billableNanoUsd += row.usage.billableNanoUsd;
    totals.rawNanoUsd += row.usage.rawNanoUsd;
    totals.quotaUsd += row.usage.quotaUsd ?? 0;
    if (isDriftSignificant(row.drift)) totals.driftAlerts += 1;
  }

  totals.poolRatio = usageRatio(totals.billableNanoUsd, poolUsd);
  return totals;
}
