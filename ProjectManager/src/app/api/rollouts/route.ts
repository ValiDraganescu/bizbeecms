import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { clampParallelism } from "@/lib/deploy/rollout-engine";
import { planRolloutForUser } from "@/lib/deploy/rollout-service";
import { planSkipReason, planWillDeploy } from "@/lib/deploy/rollout-plan";
import {
  createRollout,
  findActiveRollout,
  findRolloutById,
  listRolloutItems,
} from "@/lib/deploy/rollout-store";
import { dispatchQueuedItems } from "@/lib/deploy/rollout-runner";
import type { NewRolloutItem } from "@/db/schema";

// Kept as string literals (no union composition): the i18n parity test regex-
// extracts these keys to enforce `sites.rollout.errors.<key>` in EN/FI/ET.
export type RolloutError =
  | "notAllowed"
  | "invalidVersion"
  | "invalidParallelism"
  | "noSites"
  | "alreadyRunning"
  | "unknown";

/**
 * Start a rollout (fleet-deploy): deploy one chosen CMS release to many Sites,
 * `parallelism` builds at a time, the rest queued in D1. Body:
 * `{siteIds: string[], version: string, parallelism: number}`.
 *
 * Authz: session user; requested Site ids are scoped to `listSitesForUser` —
 * exactly the Sites this user may deploy (USER DECISION: no separate role).
 * At most one rollout is running|paused at a time (409 `alreadyRunning`).
 * Skips from the upgrade-only planner are recorded immediately as `skipped`
 * items; the first N deployable items dispatch before the response returns.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "notAllowed" }, { status: 403 });

  let body: { siteIds?: unknown; version?: unknown; parallelism?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  const parallelism = clampParallelism(body.parallelism);
  if (parallelism === null) {
    return NextResponse.json({ error: "invalidParallelism" }, { status: 400 });
  }

  const plan = await planRolloutForUser(user, body.siteIds, body.version);
  if (!plan.ok) {
    return NextResponse.json({ error: plan.error }, { status: 400 });
  }

  if (await findActiveRollout()) {
    return NextResponse.json({ error: "alreadyRunning" }, { status: 409 });
  }

  const rolloutId = crypto.randomUUID();
  const items: NewRolloutItem[] = plan.rows.map((row, position) => ({
    id: crypto.randomUUID(),
    rolloutId,
    siteId: row.siteId,
    status: planWillDeploy(row.action) ? ("queued" as const) : ("skipped" as const),
    position,
    skipReason: planSkipReason(row.action),
    ...(planWillDeploy(row.action) ? {} : { finishedAt: new Date() }),
  }));

  // All-skips rollout: nothing will ever resolve, so it's born finished.
  const deployable = items.some((i) => i.status === "queued");
  await createRollout(
    {
      id: rolloutId,
      status: deployable ? "running" : "finished",
      targetVersion: plan.version,
      targetRef: plan.ref,
      parallelism,
      createdBy: user.id,
      startedAt: new Date(),
      ...(deployable ? {} : { finishedAt: new Date() }),
    },
    items,
  );

  if (deployable) {
    const rollout = await findRolloutById(rolloutId);
    if (rollout) {
      await dispatchQueuedItems(rollout, await listRolloutItems(rolloutId));
    }
  }

  return NextResponse.json({ started: true, rolloutId });
}
