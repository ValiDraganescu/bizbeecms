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
 *   DELETE /api/v1/keys/:hash
 */

export const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/keys";

type FetchLike = typeof fetch;

export interface MintedKey {
  /** The runtime `sk-or-...` secret — returned only once, on creation. */
  key: string;
  /** Stable handle used to delete/identify the key later (never the secret). */
  hash: string;
}

/**
 * Mint a new OpenRouter runtime key.
 * @param limit monthly USD spend cap; omit/null/undefined → no cap.
 * Throws on non-2xx or a response missing `key`/`hash`.
 */
export async function mintKey(
  provisioningKey: string,
  opts: { name: string; limit?: number | null },
  fetchImpl: FetchLike = fetch,
): Promise<MintedKey> {
  if (!provisioningKey) throw new Error("mintKey: missing provisioning key");

  const body: { name: string; limit?: number } = { name: opts.name };
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
