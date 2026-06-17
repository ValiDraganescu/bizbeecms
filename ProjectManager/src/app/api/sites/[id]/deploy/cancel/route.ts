import { NextResponse } from "next/server";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import {
  findSiteById,
  isUserAssignedToSite,
  setSiteDeployStatus,
} from "@/lib/site/site";

export type CancelError = "notAllowed" | "notFound" | "notDeploying" | "unknown";

/**
 * Manually stop a deploy stuck in `deploying`. The build runs out-of-band in a
 * container we can't reach to actually kill; this just flips the PM's status to
 * `failed` so the operator is unwedged and can restart. If the (presumed-dead)
 * deploy somehow still completes, its callback will simply set the final status.
 * Authz mirrors the deploy route: actor must MANAGE the Site.
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

  await setSiteDeployStatus(siteId, "failed");
  return NextResponse.json({ cancelled: true });
}
