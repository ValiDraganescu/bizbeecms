import { NextResponse } from "next/server";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import { findSiteById, isUserAssignedToSite } from "@/lib/site/site";
import {
  buildCmsBundle,
  canStartDeploy,
  deploySite,
  type DeployErrorKey,
} from "@/lib/deploy";

export type DeployError = DeployErrorKey | "notAllowed" | "notFound" | "bundleMissing";

/**
 * REST deploy endpoint (replaces the former server action). Authz: the actor
 * must be able to MANAGE the Site — country-reach OR a `site_users` assignment.
 * The CMS bundle is the committed pre-built artifact. On success returns
 * `{ deployed: true, workerName }`.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: siteId } = await params;

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

  const bundle = await buildCmsBundle();
  if (!bundle) {
    return NextResponse.json({ error: "bundleMissing" }, { status: 500 });
  }

  const result = await deploySite({ siteId, bundle });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }
  return NextResponse.json({
    deployed: true,
    workerName: result.site.workerName ?? undefined,
  });
}
