import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { rolloutCounts } from "@/lib/deploy/rollout-engine";
import {
  findLatestRollout,
  findRolloutById,
  listRolloutItems,
} from "@/lib/deploy/rollout-store";
import { sweepStaleBuildingItems } from "@/lib/deploy/rollout-runner";

/**
 * The rollout card's poll: the newest rollout (any status — the card also
 * shows finished/stopped until the client dismisses it) + its items + counts.
 * `{rollout: null}` when none was ever started.
 *
 * Doubles as the drift safety net: a `building` item whose Site is no longer
 * `deploying` (its resolution was missed — e.g. the reaper fired for a user
 * who wasn't polling this endpoint) settles here from the Site row's actual
 * status, through the same engine path as a live callback.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "notAllowed" }, { status: 403 });

  let rollout = await findLatestRollout();
  if (!rollout) return NextResponse.json({ rollout: null });

  let items = await listRolloutItems(rollout.id);
  if (rollout.status === "running" || rollout.status === "paused") {
    try {
      if (await sweepStaleBuildingItems(rollout, items)) {
        // The sweep settled items and may have advanced the rollout itself
        // (paused by the breaker / finished) — re-read both.
        items = await listRolloutItems(rollout.id);
        rollout = (await findRolloutById(rollout.id)) ?? rollout;
      }
    } catch (e) {
      console.error(`[rollouts/active] sweep failed: ${String(e)}`);
    }
  }

  return NextResponse.json({
    rollout: {
      id: rollout.id,
      status: rollout.status,
      targetVersion: rollout.targetVersion,
      parallelism: rollout.parallelism,
      consecutiveFailures: rollout.consecutiveFailures,
      startedAt: rollout.startedAt,
      finishedAt: rollout.finishedAt,
    },
    counts: rolloutCounts(items),
    items: items.map((i) => ({
      siteId: i.siteId,
      status: i.status,
      position: i.position,
      skipReason: i.skipReason,
      error: i.error,
    })),
  });
}
