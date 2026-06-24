/**
 * OpenRouter per-KEY credit — PURE parse/format helpers (ai-openrouter goal,
 * "show remaining credit/spend for the minted PM key" slice). No `@/` imports,
 * no CF bindings → node-testable against a fake response.
 *
 * SOURCE: OpenRouter `GET https://openrouter.ai/api/v1/key` with the in-use key
 * as `Authorization: Bearer` — returns that KEY's `usage` (USD spent) and `limit`
 * (USD cap, null = uncapped). This is per-KEY, so it needs NO management key and
 * is the right granularity for a minted/deployer key (NOT `/api/v1/credits`,
 * which is account-wide and needs the management key).
 *
 * We only ever surface this for the env/minted/global key — a CMS-local user key
 * is the customer's OWN balance, out of scope (the route returns null then).
 */

/** OpenRouter's `/api/v1/key` endpoint. */
export const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";

/** What the widget shows: usage vs limit (USD), remaining when capped. */
export interface KeyCredit {
  /** USD spent on this key so far. */
  usage: number;
  /** USD cap on this key, or null when uncapped. */
  limit: number | null;
  /** USD remaining (limit - usage) when capped, else null. */
  remaining: number | null;
}

/** A number from an unknown that may be a number or numeric string; else null. */
function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Parse OpenRouter's `/api/v1/key` JSON (`{ data: { usage, limit } }`) into a
 * KeyCredit, or null when the shape is unusable (no numeric usage). `limit` null
 * means uncapped → `remaining` null. Never throws.
 */
export function parseKeyCredit(json: unknown): KeyCredit | null {
  if (!json || typeof json !== "object") return null;
  const data = (json as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  const usage = toNum(d.usage);
  if (usage == null) return null; // no spend figure → nothing to show

  const limit = toNum(d.limit); // null when uncapped or absent
  const remaining = limit == null ? null : Math.max(0, limit - usage);
  return { usage, limit, remaining };
}

/** Format a USD amount to a 2-decimal string (e.g. 1.5 → "1.50"). */
export function formatUsd(amount: number): string {
  return amount.toFixed(2);
}
