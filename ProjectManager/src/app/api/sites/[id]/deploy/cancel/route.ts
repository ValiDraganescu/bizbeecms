import { NextResponse } from "next/server";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import { findSiteById, isUserAssignedToSite } from "@/lib/site/site";
import { cancelSiteDeploy } from "@/lib/deploy/dispatch";

export type CancelError = "notAllowed" | "notFound" | "notDeploying" | "unknown";

/**
 * Cancel an in-flight deploy at ANY time (not only when stuck): kill the build
 * container immediately, then flip the Site to `failed` so the operator can
 * restart. The kill is BEST-EFFORT (see `cancelSiteDeploy`) — if the deployer
 * is unreachable we still flip PM status so the operator is never wedged; a
 * killed deploy can't fire its completion callback, so the PM flip is
 * authoritative. Authz mirrors the deploy route: actor must MANAGE the Site.
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

  if (site.status !== "deploying") {
    return NextResponse.json({ error: "notDeploying" }, { status: 409 });
  }

  const { containerKilled } = await cancelSiteDeploy(site);
  return NextResponse.json({ cancelled: true, containerKilled });
}
