import { getCloudflareContext } from "@opennextjs/cloudflare";
import { circuitBreakerLimitUsd } from "@/lib/ai/usage";
import { updateKey } from "./provision";

/**
 * Keeping a minted key's circuit-breaker cap in step with its Site's quota
 * (Contract F). Two callers need exactly this — the quota PATCH and the one-time
 * "apply caps to existing keys" backfill — so the env read and the
 * quota→cap derivation live here once instead of in both routes.
 *
 * BEST-EFFORT BY CONSTRUCTION: the cap is a safety net, not the meter. A site
 * whose cap couldn't be updated is still correctly quota-enforced by its CMS, so
 * an OpenRouter outage must never fail the operator's save. Every failure comes
 * back as a message for the caller to surface; nothing throws.
 */

export async function getProvisioningKey(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const value = (env as unknown as Record<string, unknown>).OPENROUTER_PROVISIONING_KEY;
  return typeof value === "string" ? value : "";
}

/**
 * PATCH one Site's key to the cap derived from `quotaUsd` (+ a monthly reset).
 * Returns null on success, else a short human-readable reason.
 * A Site with no minted key is a no-op success — there is nothing to cap.
 */
export async function syncKeyCap(
  provisioningKey: string,
  keyHash: string | null,
  quotaUsd: number | null,
): Promise<string | null> {
  if (!keyHash) return null;
  if (!provisioningKey) return "no OpenRouter provisioning key configured";
  try {
    await updateKey(provisioningKey, keyHash, { limit: circuitBreakerLimitUsd(quotaUsd) });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "OpenRouter update failed";
  }
}
