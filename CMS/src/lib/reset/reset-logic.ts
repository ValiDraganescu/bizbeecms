/**
 * Pure reset-token decision logic, free of DB / `@/` alias imports so it runs
 * directly under `node --test`. `checkReset` (in reset.ts) does the DB lookup
 * and delegates the classification here. Mirrors PM's `lib/reset/reset-logic.ts`.
 */

export type ResetStatus = "valid" | "notFound" | "expired" | "used";

/** Only the fields the classifier inspects (structural, DB-row compatible). */
export type ResetRow = {
  usedAt: Date | null;
  expiresAt: Date;
};

/**
 * Classify a reset token row against `now` (ms epoch).
 * - no row            => notFound
 * - usedAt set        => used (single-use spent)
 * - expiresAt <= now  => expired (the expiry instant itself is rejected)
 * - otherwise         => valid
 * Order matters: a used token reports "used" even if also expired.
 */
export function classifyReset(
  reset: ResetRow | null | undefined,
  now: number = Date.now(),
): ResetStatus {
  if (!reset) return "notFound";
  if (reset.usedAt) return "used";
  if (reset.expiresAt.getTime() <= now) return "expired";
  return "valid";
}
