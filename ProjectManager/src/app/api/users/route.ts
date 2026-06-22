import { NextResponse } from "next/server";
import { getCurrentUser, listUsersWithScope } from "@/lib/auth/user";

/**
 * GET /api/users — global user-management list (pm-roles Slice 4).
 *
 * Admin+ only (SuperAdmin / Admin manage users; Manager/Editor get 403). Returns
 * every user with their role + country + tag scope so the Slice 5 UI can render
 * the table. Per-row action gating (who you may re-role/remove) is computed by
 * the PATCH/DELETE routes via the tier + scope rules — this list is read-only.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "SuperAdmin" && user.role !== "Admin")) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }
  return NextResponse.json({ users: await listUsersWithScope() });
}
