/**
 * PURE brute-force throttle decision for CMS-local email/password login
 * (cms-auth). Login had ZERO rate limiting — an attacker could try unlimited
 * passwords against a known email. This module is the pure half: given the
 * COUNT of recent failed attempts inside the window, decide whether to lock out
 * and for how long. No `@/` imports, no CF bindings — node-`--test` loadable.
 *
 * Keyed by email (lowercased) only — NOT IP. IP is unreliable on OpenNext
 * (proxy headers) and a per-email lock protects the account actually under
 * attack; a sliding window means honest users recover automatically.
 * ponytail: per-email window; add IP/global limits only if real distributed
 * abuse shows up.
 */

/** Failures allowed inside the window before the next attempt is locked out. */
export const MAX_ATTEMPTS = 5;
/** Sliding window: only failures newer than this count toward the limit. */
export const WINDOW_MS = 15 * 60 * 1000; // 15 min

export type ThrottleDecision =
  | { locked: false }
  | { locked: true; retryAfterMs: number };

/**
 * Decide from the failure timestamps (epoch ms) recorded for an email.
 * `recentFailures` should already be the rows from the current window, but we
 * re-filter defensively so a caller that passes everything still gets it right.
 * Locked once failures in-window reach MAX_ATTEMPTS; retry-after is the time
 * until the OLDEST in-window failure ages out (when a slot frees up).
 */
export function decideThrottle(
  failureTimestamps: number[],
  now: number = Date.now(),
): ThrottleDecision {
  const inWindow = failureTimestamps
    .filter((t) => t > now - WINDOW_MS)
    .sort((a, b) => a - b);
  if (inWindow.length < MAX_ATTEMPTS) return { locked: false };
  const oldest = inWindow[0];
  const retryAfterMs = Math.max(0, oldest + WINDOW_MS - now);
  return { locked: true, retryAfterMs };
}

/** Window start (epoch ms) for "count failures since" queries. */
export function windowStart(now: number = Date.now()): number {
  return now - WINDOW_MS;
}
