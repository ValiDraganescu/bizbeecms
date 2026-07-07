/**
 * Per-site naughty-robot rate-limit threshold (seo-robots, rate-limit track 2/2).
 *
 * The Workers rate-limit BINDING (`PUBLIC_RATE_LIMITER`, wrangler.jsonc) is FIXED
 * at deploy time (100 req / 60s per IP) — you can't reprogram its period/limit at
 * runtime. So a per-site knob can only do what a single fixed binding allows
 * WITHOUT a second counter store:
 *
 *   - `off`     — skip `limiter.limit()` entirely; the site opts out of throttling.
 *   - `normal`  — use the binding as-is (100/60s). The default.
 *   - `strict`  — the binding (100/60s) PLUS an in-isolate sliding counter at a
 *                 lower cap (STRICT_LIMIT/60s), so a per-isolate hot bot is cut off
 *                 sooner than the binding alone would. ponytail: in-isolate only —
 *                 the strict counter resets on isolate recycle and isn't shared
 *                 across PoPs/isolates, so it's a best-effort TIGHTENING on top of
 *                 the real (cross-isolate) binding, never the sole gate. Upgrade
 *                 path if a hard low cap is ever needed: a Durable Object / KV
 *                 counter (the CAVEAT-noted option) — not worth it for bot defence.
 *
 * A per-site LOOSER cap than the binding's 100 is impossible with a fixed binding
 * (you can't make the binding count higher), so there's no "relaxed" preset — the
 * binding IS the ceiling; sites tune DOWN (strict) or OFF only.
 *
 * Pure + node-testable (no D1/React/CF imports). worker.ts reads the stored preset
 * OFF the hot path via a short-TTL in-isolate cache (see settings-store) — never a
 * per-request D1 read on the render gate (CAVEAT: the edge-cache "extra D1 only on
 * cache miss" precedent).
 */

export type RateLimitPreset = "off" | "normal" | "strict";

export const RATE_LIMIT_PRESETS: readonly RateLimitPreset[] = [
  "off",
  "normal",
  "strict",
] as const;

export const DEFAULT_RATE_LIMIT_PRESET: RateLimitPreset = "normal";

/**
 * The strict-preset in-isolate cap (requests per 60s window per key). Lower than
 * the binding's 100 so `strict` actually tightens. Kept a round fraction of 100.
 */
export const STRICT_LIMIT = 40;
export const STRICT_WINDOW_MS = 60_000;

/**
 * Coerce an unknown stored value to a valid preset. Anything unrecognised →
 * the default (`normal`), so a garbage/absent setting keeps the shipped behaviour.
 */
export function normalizeRateLimitPreset(value: unknown): RateLimitPreset {
  return typeof value === "string" &&
    (RATE_LIMIT_PRESETS as readonly string[]).includes(value)
    ? (value as RateLimitPreset)
    : DEFAULT_RATE_LIMIT_PRESET;
}

/** Should worker.ts call the binding's `limit()` at all for this preset? */
export function usesBindingLimiter(preset: RateLimitPreset): boolean {
  return preset !== "off";
}

/**
 * In-isolate sliding-window counter for the `strict` preset. Best-effort tightening
 * ON TOP of the binding — per-isolate, so it never replaces the binding. Returns
 * true when the key is OVER the strict cap in the current window (→ 429).
 *
 * ponytail: naive Map, no eviction sweep — a lazy TTL prune runs on each call over
 * the touched key only; the Map is bounded in practice by isolate lifetime. Upgrade
 * to a proper LRU if isolates start seeing millions of distinct IPs before recycle.
 */
export function strictCounterOverLimit(
  store: Map<string, number[]>,
  key: string,
  now: number,
  limit = STRICT_LIMIT,
  windowMs = STRICT_WINDOW_MS,
): boolean {
  const cutoff = now - windowMs;
  const hits = (store.get(key) ?? []).filter((t) => t > cutoff);
  hits.push(now);
  store.set(key, hits);
  return hits.length > limit;
}
