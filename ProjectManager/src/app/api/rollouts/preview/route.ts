import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { planRolloutForUser } from "@/lib/deploy/rollout-service";
import { displayCmsVersion } from "@/lib/deploy/cms-version";

/**
 * Dry-run of `POST /api/rollouts` for the confirm dialog: the exact per-Site
 * plan (install / upgrade / move-to-tag / skip) with nothing persisted or
 * dispatched. Same body, same authz-by-scoping.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "notAllowed" }, { status: 403 });

  let body: { siteIds?: unknown; version?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  const plan = await planRolloutForUser(user, body.siteIds, body.version);
  if (!plan.ok) {
    return NextResponse.json({ error: plan.error }, { status: 400 });
  }

  return NextResponse.json({
    version: plan.version,
    rows: plan.rows.map((row) => ({
      siteId: row.siteId,
      name: row.name,
      slug: row.slug,
      // Display form: `x.y.z` for tags, `main` verbatim, null = never deployed.
      from: displayCmsVersion(row.from),
      action: row.action,
    })),
  });
}
