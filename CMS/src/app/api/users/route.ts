/**
 * CMS user-management list endpoint (cms-auth Slice 5). Manager+ only
 * (`requireUserManager` → `canManageUsers`). Returns the CMS user list + the
 * pending invites + WHO is asking (id + role), so the client can compute the
 * per-row controls with the SAME pure helpers the server enforces with
 * (`userRowControls`). Never returns `passwordHash`.
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers).
 */
import { checkAdmin, requireUserManager } from "@/lib/auth/guard";
import { listUsers } from "@/db/user-store";
import { listPendingInvites } from "@/db/invite-store";
import type { CmsRole } from "@/db/schema";

export const dynamic = "force-dynamic";

export type UserListItem = {
  id: string;
  email: string;
  role: CmsRole;
  /** True for SSO/Google users with no local password (login method hint). */
  ssoOnly: boolean;
  createdAt: number;
};

export type PendingInviteItem = {
  id: string;
  email: string;
  role: CmsRole;
  expiresAt: number;
  createdAt: number;
};

export type UsersResponse = {
  me: { id: string; role: CmsRole };
  users: UserListItem[];
  invites: PendingInviteItem[];
};

const ms = (v: Date | number): number =>
  v instanceof Date ? v.getTime() : Number(v);

export async function GET(request: Request): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;

  // requireUserManager already proved the actor is signed-in with a role.
  const me = await checkAdmin(request);
  if (!me.allow || !me.userId || !me.role) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const [users, invites] = await Promise.all([
      listUsers(),
      listPendingInvites(),
    ]);
    const body: UsersResponse = {
      me: { id: me.userId, role: me.role },
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        ssoOnly: u.passwordHash == null,
        createdAt: ms(u.createdAt),
      })),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: ms(i.expiresAt),
        createdAt: ms(i.createdAt),
      })),
    };
    return Response.json(body);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list users" },
      { status: 500 },
    );
  }
}
