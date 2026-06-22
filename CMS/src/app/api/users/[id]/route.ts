/**
 * CMS single-user mutations (cms-auth Slice 5):
 *   PATCH  → change a user's role ({ role }) — gated by `canChangeRole`.
 *   DELETE → remove a user — gated by `canRemoveUser`.
 *
 * Both first require a Manager+ (`requireUserManager`), then re-run the EXACT
 * tier rule against the live target (the UI offers the same controls, but the
 * server is the enforcement — a Manager can't PATCH an Admin even by crafting
 * the request). 403 `forbidden` when the tier rule rejects; 404 when the target
 * doesn't exist; 400 on a bad role.
 *
 * REST-only, no server actions (PM directive — server actions 500 on OpenNext).
 */
import { checkAdmin, requireUserManager } from "@/lib/auth/guard";
import { canChangeRole, canRemoveUser } from "@/lib/auth/roles";
import { ASSIGNABLE_ROLES } from "@/lib/auth/user-mgmt";
import { findUserById, updateUserRole, deleteUser } from "@/db/user-store";
import type { CmsRole } from "@/db/schema";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Resolve the actor + the live target row, or a short-circuit Response. */
async function resolve(
  request: Request,
  id: string,
): Promise<
  | { ok: true; actor: { id: string; role: CmsRole }; target: { id: string; role: CmsRole } }
  | { ok: false; res: Response }
> {
  const denied = await requireUserManager(request);
  if (denied) return { ok: false, res: denied };

  const me = await checkAdmin(request);
  if (!me.allow || !me.userId || !me.role) {
    return { ok: false, res: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const target = await findUserById(id);
  if (!target) {
    return { ok: false, res: Response.json({ error: "notFound" }, { status: 404 }) };
  }

  return {
    ok: true,
    actor: { id: me.userId, role: me.role },
    target: { id: target.id, role: target.role },
  };
}

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const r = await resolve(request, id);
  if (!r.ok) return r.res;

  let body: { role?: unknown };
  try {
    body = (await request.json()) as { role?: unknown };
  } catch {
    return Response.json({ error: "invalidBody" }, { status: 400 });
  }

  const role = String(body.role ?? "") as CmsRole;
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return Response.json({ error: "roleInvalid" }, { status: 400 });
  }

  if (!canChangeRole(r.actor, r.target, role)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const updated = await updateUserRole(id, role);
  if (!updated) return Response.json({ error: "notFound" }, { status: 404 });
  return Response.json({ id: updated.id, role: updated.role });
}

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const r = await resolve(request, id);
  if (!r.ok) return r.res;

  if (!canRemoveUser(r.actor, r.target)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const removed = await deleteUser(id);
  return Response.json({ removed });
}
