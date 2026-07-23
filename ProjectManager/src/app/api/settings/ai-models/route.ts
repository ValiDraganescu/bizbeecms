import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import {
  normalizeCuratedPurposes,
  parsePoolUsd,
  type CuratedPurposes,
} from "@/lib/ai/curated";
import {
  checkOversell,
  getCreditPoolUsd,
  getCuratedPurposes,
  setCreditPoolUsd,
  setCuratedPurposes,
} from "@/lib/ai/settings";

/**
 * The AI curation setting: the curated model catalog + the global monthly credit
 * pool. Admin+ only — an account-wide operator knob, same gate as the global
 * build timeout. One resource for both fields so the curation page saves them
 * together (the pool is validated against site quotas as part of that save).
 *
 * GET → { purposes, poolUsd }
 * PUT { purposes, poolUsd } → normalized + persisted, returns the stored state.
 *   400 `entryInvalid` (an alias with no model id / a duplicate key),
 *   `poolInvalid` (a pool that isn't a number or blank), or `oversell` (the pool
 *   would be smaller than the sum of existing site quotas). Each carries a
 *   `message` the curation page renders verbatim.
 */
async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user != null && (user.role === "SuperAdmin" || user.role === "Admin");
}

export type AiModelsSettings = {
  purposes: CuratedPurposes;
  /** Global monthly credit pool in USD; null = unset (no oversell constraint). */
  poolUsd: number | null;
};

export async function GET(): Promise<NextResponse> {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }
  const body: AiModelsSettings = {
    purposes: await getCuratedPurposes(),
    poolUsd: await getCreditPoolUsd(),
  };
  return NextResponse.json(body);
}

export async function PUT(request: Request): Promise<NextResponse> {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  let body: { purposes?: unknown; poolUsd?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }

  const { purposes, dropped } = normalizeCuratedPurposes(body.purposes);
  if (dropped > 0) {
    return NextResponse.json(
      {
        error: "entryInvalid",
        message:
          "Every model needs an OpenRouter model id, and each alias may appear only once per purpose.",
      },
      { status: 400 },
    );
  }

  const poolUsd = parsePoolUsd(body.poolUsd);
  if (poolUsd === "invalid") {
    return NextResponse.json(
      {
        error: "poolInvalid",
        message: "The credit pool must be a number of dollars, or blank for no pool.",
      },
      { status: 400 },
    );
  }

  // Lowering (or first setting) the pool must not leave existing site quotas
  // overselling it — decision 3, same rule the site quota PATCH enforces.
  const oversell = await checkOversell({ poolUsd });
  if (oversell) {
    return NextResponse.json({ error: "oversell", message: oversell }, { status: 400 });
  }

  // Two independent app_settings keys (Contract A names them separately), so
  // they can't share a transaction — write them together and let a re-save fix
  // the (tiny) window where one lands and the other doesn't.
  await Promise.all([setCuratedPurposes(purposes), setCreditPoolUsd(poolUsd)]);

  const saved: AiModelsSettings = { purposes, poolUsd };
  return NextResponse.json(saved);
}
