import { NextResponse } from "next/server";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import { findSiteById, isUserAssignedToSite } from "@/lib/site/site";
import { listDeployEventsPaged } from "@/lib/deploy/deploy-events";

/**
 * Read the per-Site deploy-events trail (deploy-audit-trail subgoal).
 *
 * USER-facing — authed with the bizbee_session (NOT DEPLOYER_SECRET; that's
 * for the service-to-service ingest at /api/deploy-events). Same site-reach
 * check as the deploy trigger: country reach OR a site_users assignment.
 * Returns the ordered timeline; the client polls this while the Site is
 * `deploying` and renders step / start / duration / error.
 *
 * Paged: `?limit=` (default 50, max 200) + `?before=<createdAt ms cursor>` for
 * older deploys. Page 1 (no cursor) always holds the newest run; `nextCursor`
 * is the cursor for the next-older page, or null when none remain.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: siteId } = await params;
  const sp = new URL(request.url).searchParams;
  const num = (v: string | null) => (v !== null && v !== "" ? Number(v) : null);
  const limit = num(sp.get("limit"));
  const before = num(sp.get("before"));

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

  const { events, nextCursor } = await listDeployEventsPaged(siteId, {
    limit,
    before: Number.isFinite(before) ? before : null,
  });
  // status is sourced from the Site row so the client knows when to stop polling.
  return NextResponse.json({ status: site.status, events, nextCursor });
}
