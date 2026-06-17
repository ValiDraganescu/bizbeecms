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

  const { env } = await getCloudflareContext({ async: true });
  const bag = env as unknown as Record<string, unknown>;
  const deployerUrl =
    typeof bag.DEPLOYER_URL === "string" ? bag.DEPLOYER_URL : "";
  const deployerSecret =
    typeof bag.DEPLOYER_SECRET === "string" ? bag.DEPLOYER_SECRET : "";
  if (!deployerUrl || !deployerSecret) {
    return NextResponse.json({ error: "notConfigured" }, { status: 500 });
  }

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
      body: JSON.stringify({ siteId, slug: site.slug }),
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
  // callback. Client shows "deploying" and polls.
  return NextResponse.json({ accepted: true });
}
