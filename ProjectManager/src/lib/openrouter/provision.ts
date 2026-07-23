/**
 * OpenRouter Provisioning API client — mint/delete per-Site API keys.
 *
 * PM holds ONE management/provisioning key (`OPENROUTER_PROVISIONING_KEY` secret)
 * and uses it to mint a separate `sk-or-...` runtime key per Site, then deletes
 * that key (by its `hash`) when the Site no longer needs it.
 *
 * Pure over an injected `fetch` so it's testable against a fake — no live calls.
 * Docs: https://openrouter.ai/docs/features/provisioning-api-keys
 *   POST   /api/v1/keys        { name, limit? }  → { key, data: { hash, ... } }
 *   PATCH  /api/v1/keys/:hash  { limit?, limit_reset? }
 *   DELETE /api/v1/keys/:hash
 */

export const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/keys";

type FetchLike = typeof fetch;

/**
 * The key limit is a monthly-resetting CIRCUIT BREAKER, not a meter
 * (docs/ai-cost-quotas.md): without a reset the cap would be a lifetime budget
 * that silently bricks a site the month after it is reached. Every key PM mints
 * or updates carries it.
 */
export const MONTHLY_LIMIT_RESET = "monthly";

export interface MintedKey {
  /** The runtime `sk-or-...` secret — returned only once, on creation. */
  key: string;
  /** Stable handle used to delete/identify the key later (never the secret). */
  hash: string;
}

/**
 * Mint a new OpenRouter runtime key.
 * @param limit monthly USD spend cap; omit/null/undefined → no cap. Callers pass
 *   the derived circuit-breaker cap (`circuitBreakerLimitUsd`), not the raw
 *   customer quota — the quota is metered and enforced in the CMS.
 * Throws on non-2xx or a response missing `key`/`hash`.
 */
export async function mintKey(
  provisioningKey: string,
  opts: { name: string; limit?: number | null },
  fetchImpl: FetchLike = fetch,
): Promise<MintedKey> {
  if (!provisioningKey) throw new Error("mintKey: missing provisioning key");

  const body: { name: string; limit?: number; limit_reset?: string } = {
    name: opts.name,
    limit_reset: MONTHLY_LIMIT_RESET,
  };
  if (opts.limit != null) body.limit = opts.limit;

  const res = await fetchImpl(OPENROUTER_KEYS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provisioningKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`mintKey: OpenRouter ${res.status} ${await safeText(res)}`);
  }

  const json = (await res.json()) as { key?: unknown; data?: { hash?: unknown } };
  const key = json.key;
  const hash = json.data?.hash;
  if (typeof key !== "string" || typeof hash !== "string") {
    throw new Error("mintKey: response missing key/hash");
  }
  return { key, hash };
}

/**
 * Update an existing key's spend cap (Contract F). Used when a Site's monthly
 * quota changes — the key's circuit-breaker cap is derived from that quota, so
 * it has to follow it — and by the one-time "apply caps" backfill.
 *
 * `limit: null` clears the cap (a Site whose quota was unset). The monthly reset
 * is always re-sent, not just the limit: keys minted before this feature have no
 * reset at all, and a limit-only PATCH would leave them on a lifetime budget.
 * Throws on non-2xx; callers decide whether that's fatal (it usually isn't).
 */
export async function updateKey(
  provisioningKey: string,
  hash: string,
  opts: { limit: number | null },
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  if (!provisioningKey) throw new Error("updateKey: missing provisioning key");
  if (!hash) throw new Error("updateKey: missing key hash");

  const res = await fetchImpl(`${OPENROUTER_KEYS_URL}/${encodeURIComponent(hash)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${provisioningKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ limit: opts.limit, limit_reset: MONTHLY_LIMIT_RESET }),
  });

  if (!res.ok) {
    throw new Error(`updateKey: OpenRouter ${res.status} ${await safeText(res)}`);
  }
}

/**
 * Delete (revoke) a previously minted key by its hash.
 * Throws on non-2xx (callers may choose to treat 404 as already-gone).
 */
export async function deleteKey(
  provisioningKey: string,
  hash: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  if (!provisioningKey) throw new Error("deleteKey: missing provisioning key");
  if (!hash) throw new Error("deleteKey: missing key hash");

  const res = await fetchImpl(`${OPENROUTER_KEYS_URL}/${encodeURIComponent(hash)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${provisioningKey}` },
  });

  if (!res.ok) {
    throw new Error(`deleteKey: OpenRouter ${res.status} ${await safeText(res)}`);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
