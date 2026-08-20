import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Site } from "@/db/schema";
import {
  listSiteDomains,
  primaryDomainBySite,
  setSiteDeployStatus,
  setSiteMintedOpenrouterKey,
} from "@/lib/site/site";
import { getGlobalBuildTimeoutMin } from "@/lib/deploy/settings";
import { effectiveBuildTimeoutSec } from "@/lib/deploy/build-timeout";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { decideDeployOpenrouterField } from "@/lib/site/deploy-openrouter-key";
import { shouldMintOnDeploy } from "@/lib/site/mint-on-deploy";
import { mintKey } from "@/lib/openrouter/provision";
import { circuitBreakerLimitUsd } from "@/lib/ai/usage";

/**
 * Deploy-dispatch core, shared by the per-Site deploy route and the rollout
 * runner (fleet-deploy). Extracted VERBATIM from the deploy route so a
 * server-side rollout can start builds without an HTTP self-call.
 *
 * The caller owns everything request-scoped: session authz, body parsing, and
 * the `canStartDeploy` gate. This module owns the request-free rest: env
 * lookup → mint-on-deploy → per-Site key decrypt → build timeout → appOrigin →
 * hostnames → latch `deploying` → POST the deployer. On a dispatch failure the
 * Site is flipped to `failed` before returning, exactly as the route did.
 */

export type DeployError =
  | "notAllowed"
  | "notFound"
  | "alreadyDeploying"
  | "notConfigured"
  | "deployerUnreachable"
  | "unknown";

export type DispatchResult =
  | { ok: true; mintWarning: boolean; keyWarning: boolean }
  | { ok: false; error: Extract<DeployError, "notConfigured" | "deployerUnreachable"> };

/**
 * Latch `site` to `deploying` and hand the build to the deployer's container.
 * `ref` is an optional release tag (`r-<x.y.z>`), already charset-validated by
 * the caller; absent → the deployer defaults to `main`. Mutates the passed
 * `site` row in memory when minting succeeds (so decrypt sees the new key) —
 * same behavior as the original route.
 */
export async function dispatchSiteDeploy(
  site: Site,
  ref?: string,
): Promise<DispatchResult> {
  const siteId = site.id;
  const { env } = await getCloudflareContext({ async: true });
  const bag = env as unknown as Record<string, unknown>;
  const deployerUrl =
    typeof bag.DEPLOYER_URL === "string" ? bag.DEPLOYER_URL : "";
  const deployerSecret =
    typeof bag.DEPLOYER_SECRET === "string" ? bag.DEPLOYER_SECRET : "";
  if (!deployerUrl || !deployerSecret) {
    return { ok: false, error: "notConfigured" };
  }

  const kek =
    typeof bag.SITE_SECRET_KEY === "string" ? bag.SITE_SECRET_KEY : "";

  // Mint-on-deploy (KEY-MINTING Slice 5): if the Site has minting enabled and
  // no minted key yet, mint one now via the Provisioning API, encrypt it, and
  // persist (ciphertext + hash). Idempotent — a Site that already has a key is
  // never re-minted. Minting MUST NOT crash the deploy: any failure (no
  // provisioning key, OpenRouter error, encrypt error) is caught and logged,
  // and the deploy proceeds with the deployer's global fallback key.
  let mintFailed = false;
  if (shouldMintOnDeploy(site.openrouterMintingEnabled, site.openrouterKeyHash)) {
    const provKey =
      typeof bag.OPENROUTER_PROVISIONING_KEY === "string"
        ? bag.OPENROUTER_PROVISIONING_KEY
        : "";
    try {
      const minted = await mintKey(provKey, {
        name: site.slug,
        // NOT the raw quota: the quota is the customer's billable allowance,
        // metered and enforced in the CMS. The KEY limit is a circuit breaker —
        // a generous multiple of it that only trips when soft enforcement was
        // bypassed (docs/ai-cost-quotas.md).
        limit: circuitBreakerLimitUsd(site.openrouterMonthlyLimitUsd),
      });
      const ciphertext = await encryptSecret(minted.key, kek);
      await setSiteMintedOpenrouterKey(siteId, ciphertext, minted.hash);
      // Reflect the new key locally so the decrypt-and-thread path below sends it.
      site.openrouterApiKeyEncrypted = ciphertext;
      site.openrouterKeyHash = minted.hash;
    } catch (e) {
      mintFailed = true;
      console.warn(
        `[deploy] Site ${siteId}: OpenRouter key mint failed; proceeding with ` +
          `the deployer's global key. ${e instanceof Error ? e.message : ""}`,
      );
    }
  }

  // Per-Site OpenRouter key (Slice 3): if the Site has one stored encrypted,
  // decrypt it and pass the PLAINTEXT to the deployer over the existing HTTPS
  // call. A decrypt failure (bad/rotated/unset SITE_SECRET_KEY, corrupt blob)
  // MUST NOT fail the deploy — we omit the field and let the deployer fall back
  // to its global OPENROUTER_API_KEY. Decrypt up-front so the helper stays pure.
  let decrypted: string | null = null;
  if (site.openrouterApiKeyEncrypted) {
    try {
      decrypted = await decryptSecret(site.openrouterApiKeyEncrypted, kek);
    } catch {
      decrypted = null; // signal failure to the helper below
    }
  }
  const { body: openrouterBody, degraded } = decideDeployOpenrouterField(
    site.openrouterApiKeyEncrypted,
    // decryption already happened above; the thunk just surfaces success/failure
    () => {
      if (decrypted === null) throw new Error("decrypt failed");
      return decrypted;
    },
  );
  if (degraded) {
    console.warn(
      `[deploy] Site ${siteId}: OpenRouter key present but failed to decrypt; ` +
        `omitting it and falling back to the deployer's global key.`,
    );
  }

  // Effective build timeout (anti-stall): max(global, per-Site override). Sent
  // to the deployer as seconds; it kills a run that exceeds it so a stalled
  // build can't keep the container awake (memory+disk bill on wall-clock).
  const buildTimeoutSec = effectiveBuildTimeoutSec(
    await getGlobalBuildTimeoutMin(),
    site.buildTimeoutMin,
  );

  // Primary custom domain (cms-mcp part a): when the Site has a custom domain
  // attached, send its origin so the deployer sets APP_ORIGIN to it instead of
  // the workers.dev URL. APP_ORIGIN drives the MCP URL the CMS advertises and
  // trusted invite/reset links — all should point at the custom domain. Absent
  // → the deployer falls back to workers.dev. The deployer re-validates (https
  // + hostname) in chooseAppOrigin, so a junk value can't slip through.
  const primaryDomain = (await primaryDomainBySite([siteId])).get(siteId);
  const appOrigin = primaryDomain ? `https://${primaryDomain}` : undefined;

  // ALL attached hostnames (serve + redirect): the deployer uses them to flip
  // active TXT-validated custom hostnames to HTTP DCV so cert renewals stop
  // requiring the customer to re-add _acme-challenge TXTs (deployer
  // ensureHttpDcv). Best-effort on the deployer side; absent = skipped.
  const hostnames = (await listSiteDomains(siteId)).map((d) => d.hostname);

  // Latch to `deploying` before dispatching, so a refresh shows progress and
  // re-clicks are guarded by canStartDeploy.
  await setSiteDeployStatus(siteId, "deploying");

  try {
    const res = await fetch(`${deployerUrl.replace(/\/+$/, "")}/deploy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${deployerSecret}`,
      },
      body: JSON.stringify({
        siteId,
        slug: site.slug,
        buildTimeoutSec,
        ...(ref ? { ref } : {}),
        ...(appOrigin ? { appOrigin } : {}),
        ...(hostnames.length > 0 ? { hostnames } : {}),
        ...openrouterBody,
      }),
    });
    if (!res.ok) {
      await setSiteDeployStatus(siteId, "failed");
      return { ok: false, error: "deployerUnreachable" };
    }
  } catch {
    await setSiteDeployStatus(siteId, "failed");
    return { ok: false, error: "deployerUnreachable" };
  }

  return { ok: true, mintWarning: mintFailed, keyWarning: degraded };
}

/**
 * Kill an in-flight build (best-effort) and flip the Site to `failed`. The
 * build runs detached in the deployer's named Sandbox container; a killed
 * deploy can't fire its completion callback, so the PM status flip here is
 * authoritative. Shared by the per-Site cancel route and rollout stop.
 */
export async function cancelSiteDeploy(
  site: Pick<Site, "id" | "slug">,
): Promise<{ containerKilled: boolean }> {
  const { env } = await getCloudflareContext({ async: true });
  const bag = env as unknown as Record<string, unknown>;
  const deployerUrl =
    typeof bag.DEPLOYER_URL === "string" ? bag.DEPLOYER_URL : "";
  const deployerSecret =
    typeof bag.DEPLOYER_SECRET === "string" ? bag.DEPLOYER_SECRET : "";
  let containerKilled = false;
  if (deployerUrl && deployerSecret) {
    try {
      const res = await fetch(`${deployerUrl.replace(/\/+$/, "")}/cancel`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${deployerSecret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ slug: site.slug }),
      });
      containerKilled = res.ok;
    } catch {
      // best-effort — fall through to the status flip
    }
  }
  await setSiteDeployStatus(site.id, "failed");
  return { containerKilled };
}
