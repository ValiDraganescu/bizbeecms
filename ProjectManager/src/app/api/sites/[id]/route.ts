import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkOversell } from "@/lib/ai/settings";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { authorizeSiteCountry, canManageSiteByCountry, canUserCreateSite } from "@/lib/site/authz";
import {
  deleteSite,
  findSiteById,
  isSlugTaken,
  listSiteDomains,
  updateSite,
} from "@/lib/site/site";
import { getProvisioningKey, syncKeyCap } from "@/lib/openrouter/key-cap";
import { deleteKey } from "@/lib/openrouter/provision";
import { isDeployStuck } from "@/lib/deploy";
import { parseSiteBody, type SiteBody } from "../route";

/**
 * REST update-Site endpoint (replaces the former server action). The actor must
 * be able to create Sites AND reach this Site by country; the new country must
 * be within their scope. On success returns `{ savedId }`.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: siteId } = await params;

  const user = await getCurrentUser();
  if (!user || !canUserCreateSite(user)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  const site = await findSiteById(siteId);
  if (!site) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const actorCountries = await getUserCountries(user.id);
  if (!canManageSiteByCountry(user, actorCountries, site)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  let body: SiteBody;
  try {
    body = (await request.json()) as SiteBody;
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  const parsed = parseSiteBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const {
    name,
    slug,
    country,
    openrouterMintingEnabled,
    openrouterMonthlyLimitUsd,
    buildTimeoutMin,
  } = parsed.value;

  const authzError = authorizeSiteCountry(user, actorCountries, country);
  if (authzError) {
    return NextResponse.json({ error: authzError }, { status: 403 });
  }

  if (await isSlugTaken(slug, siteId)) {
    return NextResponse.json({ error: "slugTaken" }, { status: 409 });
  }

  // No oversell: this Site's monthly quota plus every other Site's must stay
  // within the configured AI credit pool (docs/ai-cost-quotas.md, decision 3).
  // No pool configured → no constraint.
  const oversell = await checkOversell({
    siteId,
    quotaUsd: openrouterMonthlyLimitUsd,
  });
  if (oversell) {
    return NextResponse.json({ error: "oversell", message: oversell }, { status: 400 });
  }

  try {
    // Key value is never user-entered now — minting (toggle + spend limit) is
    // persisted here; the key itself is minted/deleted in later slices.
    await updateSite(siteId, {
      name,
      slug,
      country,
      openrouterMintingEnabled,
      openrouterMonthlyLimitUsd,
      buildTimeoutMin,
    });

    // The minted key's OpenRouter limit is a circuit breaker derived from the
    // quota, so a quota change has to drag it along (Contract F). Best-effort:
    // the quota itself is already saved and the CMS enforces it locally, so an
    // OpenRouter failure is a WARNING on a successful save, never a 500.
    let capWarning: string | null = null;
    if (site.openrouterKeyHash && openrouterMonthlyLimitUsd !== site.openrouterMonthlyLimitUsd) {
      capWarning = await syncKeyCap(
        await getProvisioningKey(),
        site.openrouterKeyHash,
        openrouterMonthlyLimitUsd,
      );
      if (capWarning) {
        console.warn(`[sites] Site ${siteId}: key cap update failed. ${capWarning}`);
      }
    }

    return NextResponse.json({ savedId: siteId, ...(capWarning ? { capWarning } : {}) });
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}

export type DeleteSiteError =
  | "notAllowed"
  | "notFound"
  | "confirmMismatch"
  | "deployInProgress"
  | "notConfigured"
  | "teardownFailed"
  | "deployerUnreachable"
  | "unknown";

/**
 * Delete a Site and everything it owns. Order matters:
 *
 *  1. Authz — the strict gate (create-Sites role AND country reach), NOT the
 *     looser deploy gate: assignment-only Editors must never delete a Site.
 *  2. Slug confirmation — the body's `confirmSlug` must equal the Site's slug;
 *     the UI asks the operator to type it, and the server re-checks it.
 *  3. External teardown FIRST, DB delete LAST: revoke the minted OpenRouter
 *     key (best-effort — it's spend-capped, so a failure is a warning), then
 *     have the deployer (the only component with a CF token) remove the
 *     Worker, D1, R2 bucket, custom hostnames and HOST_MAP entries. If that
 *     teardown fails, we KEEP the Site row and return 502 so the operator can
 *     retry — otherwise the still-serving worker would be orphaned with no
 *     handle left to delete it by.
 *  4. Delete the `sites` row; child tables cascade.
 *
 * A never-deployed draft owns no Cloudflare resources, so it skips step 3's
 * deployer call and deletes even when the deployer is down/unconfigured.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: siteId } = await params;

  const user = await getCurrentUser();
  if (!user || !canUserCreateSite(user)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  const site = await findSiteById(siteId);
  if (!site) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const actorCountries = await getUserCountries(user.id);
  if (!canManageSiteByCountry(user, actorCountries, site)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    confirmSlug?: unknown;
  };
  if (String(body.confirmSlug ?? "").trim() !== site.slug) {
    return NextResponse.json({ error: "confirmMismatch" }, { status: 400 });
  }

  // A live deploy is writing to the very resources we're about to remove.
  // Stuck ones (dead container) don't block — teardown kills the sandbox too.
  if (site.status === "deploying" && !isDeployStuck(site)) {
    return NextResponse.json({ error: "deployInProgress" }, { status: 409 });
  }

  const warnings: string[] = [];

  // Revoke the minted OpenRouter key. 404 = already revoked; any other
  // failure is a warning, not a blocker — the key is spend-capped and its
  // hash dies with the row, so a retry loop here isn't worth wedging delete.
  if (site.openrouterKeyHash) {
    try {
      await deleteKey(await getProvisioningKey(), site.openrouterKeyHash);
    } catch (err) {
      if (!String(err).includes(" 404")) {
        warnings.push("openrouterKey");
        console.warn(`[sites] delete ${siteId}: OpenRouter key revoke failed. ${err}`);
      }
    }
  }

  // Cloudflare teardown via the deployer — skipped only for a Site that never
  // attempted a deploy (still `draft`, no worker recorded): nothing was ever
  // provisioned for it. Failed/stuck deploys may have left D1/R2 behind, so
  // they DO go through teardown.
  if (site.status !== "draft" || site.workerName != null) {
    const { env } = await getCloudflareContext({ async: true });
    const bag = env as unknown as Record<string, unknown>;
    const deployerUrl =
      typeof bag.DEPLOYER_URL === "string" ? bag.DEPLOYER_URL : "";
    const deployerSecret =
      typeof bag.DEPLOYER_SECRET === "string" ? bag.DEPLOYER_SECRET : "";
    if (!deployerUrl || !deployerSecret) {
      return NextResponse.json({ error: "notConfigured" }, { status: 500 });
    }

    const domains = await listSiteDomains(site.id);
    try {
      const res = await fetch(`${deployerUrl.replace(/\/+$/, "")}/delete-site`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${deployerSecret}`,
        },
        body: JSON.stringify({
          slug: site.slug,
          // The deployed Worker's actual name — resource names derive from it
          // (a slug rename after deploy doesn't rename CF resources).
          workerName: site.workerName,
          hostnames: domains.map((d) => d.hostname),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        results?: Record<string, string>;
      };
      if (!res.ok || data.ok !== true) {
        console.warn(
          `[sites] delete ${siteId}: teardown incomplete ${JSON.stringify(data.results ?? {})}`,
        );
        return NextResponse.json(
          { error: "teardownFailed", results: data.results ?? null },
          { status: 502 },
        );
      }
    } catch {
      return NextResponse.json({ error: "deployerUnreachable" }, { status: 502 });
    }
  }

  try {
    await deleteSite(siteId);
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(warnings.length ? { warnings } : {}) });
}
