import { NextResponse } from "next/server";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import {
  findSiteById,
  isUserAssignedToSite,
  setSiteDeployStatus,
} from "@/lib/site/site";
import {
  listDeployEventsPaged,
  insertDeployEvent,
  buildFailedCallbackEvent,
} from "@/lib/deploy/deploy-events";
import { shouldReapDeploy } from "@/lib/deploy/deploy-state";
import { effectiveBuildTimeoutMin } from "@/lib/deploy/build-timeout";
import { getGlobalBuildTimeoutMin } from "@/lib/deploy/settings";

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
 *
 * `?latest=1` (the Sites-list status badge) narrows the response to ONLY the
 * current deploy run's events — the badge just shows live state, so shipping the
 * whole 50-event history (past runs included) is wasted bytes. `nextCursor` is
 * forced null in that mode (a single run is never paged).
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
  const latestOnly = sp.get("latest") === "1";

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

  // Deploy-timeout reaper: a `deploying` row whose container blew past its own
  // hard timeout (+ grace) can never resolve itself — the timeout SIGKILL can
  // drop the container's failed-callback and nothing retries it (verified live
  // 2026-07-02). The UI polls this endpoint every 5s while `deploying`, so it
  // doubles as the reaper: flip the row to failed and leave a terminal event
  // saying why. Runs after the reach check, so only users who could see the
  // Site anyway can trigger it.
  let status = site.status;
  if (site.status === "deploying") {
    const timeoutMin = effectiveBuildTimeoutMin(
      await getGlobalBuildTimeoutMin(),
      site.buildTimeoutMin,
    );
    if (shouldReapDeploy(site, timeoutMin)) {
      await setSiteDeployStatus(site.id, "failed");
      status = "failed";
      try {
        await insertDeployEvent(
          buildFailedCallbackEvent(
            site.id,
            `deploy timed out: no callback from the build container within ${timeoutMin}min + grace — run presumed killed`,
            null,
            Date.now(),
            latestDeployId(events),
          ),
        );
      } catch {
        // best-effort: the status flip above is what unwedges the Site
      }
    }
  }

  // status is sourced from the Site row so the client knows when to stop polling.
  if (latestOnly) {
    // The Sites-list badge shows live state only — no console — so strip the
    // (bulky, numerous) streamed log rows; it just needs the step events.
    return NextResponse.json({
      status,
      events: latestRunEvents(events).filter((e) => e.status !== "log"),
      nextCursor: null,
    });
  }
  return NextResponse.json({ status, events, nextCursor });
}

/**
 * Keep only the most-recent deploy run's events (`?latest=1`). The latest run is
 * the `deployId` of the event with the greatest `startedAt`. Mirrors
 * `selectLatestRun` (which works on the string-dated client rows); here startedAt
 * is a Date. ms-epoch tie-break is last-wins on the oldest-first `events`.
 */
function latestRunEvents<T extends { deployId: string | null; startedAt: Date }>(
  events: readonly T[],
): T[] {
  if (events.length === 0) return [];
  const latestId = latestDeployId(events);
  return events.filter((e) => e.deployId === latestId);
}

/** The `deployId` of the newest event (greatest `startedAt`), or null when none. */
function latestDeployId(
  events: readonly { deployId: string | null; startedAt: Date }[],
): string | null {
  let latestId: string | null = null;
  let latestAt = -Infinity;
  for (const e of events) {
    const at = e.startedAt.getTime();
    if (at >= latestAt) {
      latestAt = at;
      latestId = e.deployId;
    }
  }
  return latestId;
}
