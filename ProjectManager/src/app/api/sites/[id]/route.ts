import { NextResponse } from "next/server";
import { checkOversell } from "@/lib/ai/settings";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { authorizeSiteCountry, canManageSiteByCountry, canUserCreateSite } from "@/lib/site/authz";
import { findSiteById, isSlugTaken, updateSite } from "@/lib/site/site";
import { getProvisioningKey, syncKeyCap } from "@/lib/openrouter/key-cap";
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
