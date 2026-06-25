/**
 * Build-timeout resolution — the cap the deployer enforces on a single
 * build+deploy run (anti-stall: a hung build keeps the container awake, and
 * memory+disk bill on wall-clock, not CPU).
 *
 * Two knobs: a GLOBAL setting (app_settings) and an optional PER-SITE override
 * (sites.build_timeout_min). The effective timeout is the LARGER of the two in
 * minutes — a site can only RAISE its cap above the global floor, never drop
 * below it (so the global is a guaranteed minimum the operator controls). A
 * site override of null/absent means "just use the global".
 *
 * Pure — no drizzle/env — so it runs under `node --test`.
 */

// Fallback global when the operator hasn't set one. Matches the deployer's own
// DEFAULT_BUILD_TIMEOUT_SEC (720s = 12min): a real CMS build is ~6min.
export const DEFAULT_BUILD_TIMEOUT_MIN = 12;

// Guard rails for an operator-entered value (minutes). Below 1min no real build
// finishes; above 60min defeats the anti-stall purpose. Used to clamp input.
export const MIN_BUILD_TIMEOUT_MIN = 1;
export const MAX_BUILD_TIMEOUT_MIN = 60;

/** A positive integer, else null. Shared input coercion for the setting + override. */
export function coerceTimeoutMin(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return null;
  return Math.min(Math.max(n, MIN_BUILD_TIMEOUT_MIN), MAX_BUILD_TIMEOUT_MIN);
}

/**
 * Effective build timeout in MINUTES = max(global, perSite), with the global
 * itself defaulting when unset. perSite null/invalid → ignored (global wins).
 */
export function effectiveBuildTimeoutMin(
  globalMin: number | null | undefined,
  perSiteMin: number | null | undefined,
): number {
  const g = coerceTimeoutMin(globalMin) ?? DEFAULT_BUILD_TIMEOUT_MIN;
  const s = coerceTimeoutMin(perSiteMin);
  return s != null ? Math.max(g, s) : g;
}

/** Same, in SECONDS — the unit the deployer's `timeout` command wants. */
export function effectiveBuildTimeoutSec(
  globalMin: number | null | undefined,
  perSiteMin: number | null | undefined,
): number {
  return effectiveBuildTimeoutMin(globalMin, perSiteMin) * 60;
}
