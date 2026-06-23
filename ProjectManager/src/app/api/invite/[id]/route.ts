import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { canUserInvite } from "@/lib/invite/authz";
import { deleteInvite } from "@/lib/invite/invite";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Revoke a pending invitation (mirror of cms-auth Slice 5). Gated by the SAME
 * authz as creating one (`canUserInvite` — SuperAdmin / canInvite Admin). The
 * store fn re-checks the invite is still pending and 404s otherwise.
 *
 * REST-only, no server actions (server actions 500 on OpenNext/Workers).
 */
export async function DELETE(
  _request: Request,
  { params }: Ctx,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || !canUserInvite(user)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  const { id } = await params;
  const removed = await deleteInvite(id);
  if (!removed) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }
  return NextResponse.json({ revoked: true });
}
