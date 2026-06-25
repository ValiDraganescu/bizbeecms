import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import {
  findSiteById,
  isUserAssignedToSite,
  setSiteDeployStatus,
} from "@/lib/site/site";
import { canStartDeploy } from "@/lib/deploy";
import { getGlobalBuildTimeoutMin } from "@/lib/deploy/settings";
import { effectiveBuildTimeoutSec } from "@/lib/deploy/build-timeout";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { decideDeployOpenrouterField } from "@/lib/site/deploy-openrouter-key";
import { shouldMintOnDeploy } from "@/lib/site/mint-on-deploy";
import { mintKey } from "@/lib/openrouter/provision";
import { setSiteMintedOpenrouterKey } from "@/lib/site/site";

export type DeployError =
  | "notAllowed"
  | "notFound"
  | "alreadyDeploying"
  | "notConfigured"
  | "deployerUnreachable"
  | "unknown";

/**
 * Trigger a CMS deploy for a Site (async fire-and-poll). Authz: the actor must
 * MANAGE the Site — country-reach OR a `site_users` assignment.
 *
 * The actual build runs in the bizbeecms-deployer Worker's container (real
 * `opennextjs-cloudflare build` + `wrangler deploy`, the same path that deploys
 * the PM). We latch the Site to `deploying`, POST the job to the deployer, and
 * return immediately; the deployer calls `/api/deploy-callback` when done to set
 * `deployed`/`failed`. The page reflects status on refresh.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: siteId } = await params;

  // Optional chosen CMS release ref (a `cms-v<x.y.z>` tag, picked in Slice 5's
  // version picker). Absent → the deployer defaults to `main`. Validated against
  // the same charset the deployer accepts so we never forward junk.
  let ref: string | undefined;
  try {
    const parsed = (await request.json()) as { ref?: unknown };
    if (typeof parsed?.ref === "string" && /^[\w.\-/]+$/.test(parsed.ref)) {
      ref = parsed.ref;
    }
  } catch {
    // No/invalid JSON body — fine, deploy with the default ref.
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "notAllowed" }, { status: 403 });

  const site = await findSiteById(siteId);
  if (!site) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const actorCountries = await getUserCountries(user.id);
  const reachable =
    canManageSiteByCountry(user, actorCountries, site) ||
    (await isUserAssignedToSite(user.id, site.id));
  if (!reachable) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  if (!canStartDeploy(site)) {
    return NextResponse.json({ error: "alreadyDeploying" }, { status: 409 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const bag = env as unknown as Record<string, unknown>;
  const deployerUrl =
    typeof bag.DEPLOYER_URL === "string" ? bag.DEPLOYER_URL : "";
  const deployerSecret =
    typeof bag.DEPLOYER_SECRET === "string" ? bag.DEPLOYER_SECRET : "";
  if (!deployerUrl || !deployerSecret) {
    return NextResponse.json({ error: "notConfigured" }, { status: 500 });
  }

  const kek =
    typeof bag.SITE_SECRET_KEY === "string" ? bag.SITE_SECRET_KEY : "";

  // Mint-on-deploy (KEY-MINTING Slice 5): if the Site has minting enabled and
  // no minted key yet, mint one now via the Provisioning API, encrypt it, and
  // persist (ciphertext + hash). Idempotent — a Site that already has a key is
  // never re-minted. Minting MUST NOT crash the deploy: any failure (no
  // provisioning key, OpenRouter error, encrypt error) is caught and logged,
  // and the deploy proceeds with the deployer's global fallback key.
  // Set when minting was attempted but failed — surfaced to the operator in the
  // deploy response so the silent "fell back to the global key" isn't invisible.
  let mintFailed = false;
  if (shouldMintOnDeploy(site.openrouterMintingEnabled, site.openrouterKeyHash)) {
    const provKey =
      typeof bag.OPENROUTER_PROVISIONING_KEY === "string"
        ? bag.OPENROUTER_PROVISIONING_KEY
        : "";
    try {
      const minted = await mintKey(provKey, {
        name: site.slug,
        limit: site.openrouterMonthlyLimitUsd ?? undefined,
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
        ...openrouterBody,
      }),
    });
    if (!res.ok) {
      await setSiteDeployStatus(siteId, "failed");
      return NextResponse.json(
        { error: "deployerUnreachable" },
        { status: 502 },
      );
    }
  } catch {
    await setSiteDeployStatus(siteId, "failed");
    return NextResponse.json({ error: "deployerUnreachable" }, { status: 502 });
  }

  // Accepted — the deploy is running in the container; status finalizes via the
  // callback. Client shows "deploying" and polls. Both warnings are non-blocking:
  // `mintWarning` — minting failed, deploy used the deployer's global key.
  // `keyWarning` — a stored per-Site key couldn't be decrypted (bad/rotated
  // SITE_SECRET_KEY or a corrupt blob), so the deploy fell back to the global key.
  return NextResponse.json({
    accepted: true,
    ...(mintFailed ? { mintWarning: true } : {}),
    ...(degraded ? { keyWarning: true } : {}),
  });
}
