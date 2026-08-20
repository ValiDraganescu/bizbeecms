import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { canControlRollout } from "@/lib/deploy/rollout-service";
import { findRolloutById, updateRollout } from "@/lib/deploy/rollout-store";

/**
 * Manually pause a running rollout: nothing new dispatches; in-flight builds
 * finish and settle normally. Same state the circuit breaker moves to.
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
  if (rollout.status !== "running") {
    return NextResponse.json({ error: "notRunning" }, { status: 409 });
  }

  await updateRollout(id, { status: "paused" });
  return NextResponse.json({ paused: true });
}
