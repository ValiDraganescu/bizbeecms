import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import {
  findSiteById,
  isUserAssignedToSite,
  setSiteDeployStatus,
} from "@/lib/site/site";

export type CancelError = "notAllowed" | "notFound" | "notDeploying" | "unknown";

/**
 * Cancel an in-flight deploy at ANY time (not only when stuck): kill the build
 * container immediately, then flip the Site to `failed` so the operator can
 * restart. The build runs detached in the deployer's named Sandbox container;
 * we POST the deployer's `/cancel`, which `destroy()`s that container. The kill
 * is BEST-EFFORT — if the deployer is unreachable we still flip PM status so the
 * operator is never wedged; a killed deploy can't fire its completion callback,
 * so the PM flip below is authoritative. Authz mirrors the deploy route: actor
 * must MANAGE the Site.
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

  // Kill the build container first (best-effort), then flip status. A failure
  // here (deployer down, container already gone) must NOT block the status flip.
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

  await setSiteDeployStatus(siteId, "failed");
  return NextResponse.json({ cancelled: true, containerKilled });
}
