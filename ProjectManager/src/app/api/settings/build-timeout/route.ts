import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import {
  getGlobalBuildTimeoutMin,
  setGlobalBuildTimeoutMin,
} from "@/lib/deploy/settings";
import { coerceTimeoutMin } from "@/lib/deploy/build-timeout";

/**
 * Global build-timeout setting (deploy anti-stall). Admin+ only — this is an
 * account-wide operator knob, same gate as /api/users.
 *
 * GET  → { buildTimeoutMin }
 * PUT { buildTimeoutMin } → validated + clamped, persisted, returns the stored value.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "SuperAdmin" && user.role !== "Admin")) {
    return null;
  }
  return user;
}

export async function GET(): Promise<NextResponse> {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }
  return NextResponse.json({ buildTimeoutMin: await getGlobalBuildTimeoutMin() });
}

export async function PUT(request: Request): Promise<NextResponse> {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }
  let body: { buildTimeoutMin?: unknown };
  try {
    body = (await request.json()) as { buildTimeoutMin?: unknown };
  } catch {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  const min = coerceTimeoutMin(body.buildTimeoutMin);
  if (min == null) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  await setGlobalBuildTimeoutMin(min);
  return NextResponse.json({ buildTimeoutMin: min });
}
