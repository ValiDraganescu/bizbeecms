import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { findSiteById } from "@/lib/site/site";
import { cancelSiteDeploy } from "@/lib/deploy/dispatch";
import { canControlRollout } from "@/lib/deploy/rollout-service";
import {
  cancelBuildingItem,
  cancelQueuedItems,
  findRolloutById,
  listRolloutItems,
  updateRollout,
} from "@/lib/deploy/rollout-store";

/**
 * Stop a rollout for good: queued items are cancelled, in-flight builds are
 * killed (best-effort, via the same per-Site cancel the detail page uses — a
 * killed build can't fire its callback, so the Site flip to `failed` here is
 * authoritative), and the rollout goes `stopped`. Finished Sites stay on the
 * target version.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "notAllowed" }, { status: 403 });

  const { id } = await params;
  const rollout = await findRolloutById(id);
  if (!rollout) return NextResponse.json({ error: "notFound" }, { status: 404 });
  if (!canControlRollout(user, rollout)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }
  if (rollout.status !== "running" && rollout.status !== "paused") {
    return NextResponse.json({ error: "notActive" }, { status: 409 });
  }

  // Stop the rollout FIRST so no resolution/sweep dispatches more work while
  // we cancel, then clear the queue and kill in-flight builds.
  await updateRollout(id, { status: "stopped", finishedAt: new Date() });
  await cancelQueuedItems(id);

  for (const item of await listRolloutItems(id)) {
    if (item.status !== "building") continue;
    try {
      const site = await findSiteById(item.siteId);
      if (site) await cancelSiteDeploy(site);
    } catch (e) {
      console.error(`[rollouts/stop] cancel failed for ${item.siteId}: ${String(e)}`);
    }
    await cancelBuildingItem(item.id);
  }

  return NextResponse.json({ stopped: true });
}
