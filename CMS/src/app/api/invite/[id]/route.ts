/**
 * Revoke a pending CMS invite (cms-auth Slice 5). Manager+ only
 * (`requireUserManager` → `canManageUsers`, the same gate that lets you create
 * invites via `POST /api/invite`). Deletes the invite row so the accept link is
 * dead. 404 when the invite doesn't exist (or was already accepted/revoked).
 *
 * REST-only, no server actions (PM directive — server actions 500 on OpenNext).
 */
import { requireUserManager } from "@/lib/auth/guard";
import { deleteInvite } from "@/db/invite-store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;

  const { id } = await params;
  const removed = await deleteInvite(id);
  if (!removed) return Response.json({ error: "notFound" }, { status: 404 });
  return Response.json({ revoked: true });
}
