import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { canControlRollout } from "@/lib/deploy/rollout-service";
import {
  findRolloutById,
  listRolloutItems,
  updateRollout,
} from "@/lib/deploy/rollout-store";
import { dispatchQueuedItems } from "@/lib/deploy/rollout-runner";

/**
 * Resume a paused rollout (manual pause or a tripped circuit breaker): the
 * consecutive-failure streak resets (USER DECISION) and free slots refill
 * from the queue immediately.
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
  if (rollout.status !== "paused") {
    return NextResponse.json({ error: "notPaused" }, { status: 409 });
  }

  await updateRollout(id, { status: "running", consecutiveFailures: 0 });
  const resumed = await findRolloutById(id);
  if (resumed) {
    await dispatchQueuedItems(resumed, await listRolloutItems(id));
  }
  return NextResponse.json({ resumed: true });
}
