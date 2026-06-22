/**
 * D1 persistence for CMS invites (cms-auth Slice 4). CF-coupled (reads D1 via the
 * `Db` port — NEVER `env.DB` directly, or the sole-reader guard flips red), so
 * NOT node-loadable; the pure token/TTL/status logic lives in
 * `lib/invite/invite-core.ts` (node-tested).
 *
 * Mirrors PM's `lib/invite/invite.ts` with country/tag scope DROPPED. Email is
 * normalised (trim + lowercase) before write/lookup so casing can't fork an
 * account. The plaintext password never touches this layer — `acceptInvite`
 * takes an already-hashed `passwordHash` (callers hash via `hashPassword` first,
 * keeping the pure/CF crypto split — see CAVEATS).
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import type { CmsRole, Invite, User } from "./schema.ts";
import {
  buildInviteTimes,
  classifyInvite,
  newInviteToken,
  type InviteRecord,
  type InviteStatus,
} from "../lib/invite/invite-core.ts";
import { createUser, findUserByEmail, normalizeEmail } from "./user-store.ts";

function toRecord(row: Invite): InviteRecord {
  const ms = (v: Date | number | null) =>
    v == null ? null : v instanceof Date ? v.getTime() : Number(v);
  return {
    email: row.email,
    role: row.role,
    acceptedAt: ms(row.acceptedAt),
    expiresAt: ms(row.expiresAt) as number,
  };
}

export type CreateInviteInput = {
  email: string;
  role: CmsRole;
  invitedBy: string;
};

/**
 * Create a pending invite. Returns the stored row (incl. the accept token).
 * `injectedDb` is for tests only (prod resolves via the Db port).
 */
export async function createInvite(
  input: CreateInviteInput,
  injectedDb?: Db,
): Promise<Invite> {
  const db = injectedDb ?? (await getDb());
  const { createdAt, expiresAt } = buildInviteTimes();
  const id = crypto.randomUUID();
  await db.insert(schema.invite).values({
    id,
    email: normalizeEmail(input.email),
    role: input.role,
    invitedBy: input.invitedBy,
    token: newInviteToken(),
    createdAt: new Date(createdAt),
    expiresAt: new Date(expiresAt),
  });
  const [stored] = await db.select().from(schema.invite).where(eq(schema.invite.id, id));
  return stored;
}

/** Find an invite by its accept token, or null. */
export async function findInviteByToken(
  token: string,
  injectedDb?: Db,
): Promise<Invite | null> {
  const db = injectedDb ?? (await getDb());
  const [row] = await db
    .select()
    .from(schema.invite)
    .where(eq(schema.invite.token, token));
  return row ?? null;
}

/** True if a pending (not-yet-accepted) invite already exists for this email. */
export async function hasPendingInvite(
  email: string,
  injectedDb?: Db,
): Promise<boolean> {
  const db = injectedDb ?? (await getDb());
  const [row] = await db
    .select({ id: schema.invite.id })
    .from(schema.invite)
    .where(
      and(
        eq(schema.invite.email, normalizeEmail(email)),
        isNull(schema.invite.acceptedAt),
      ),
    )
    .limit(1);
  return row != null;
}

/** Pending (not yet accepted) invites, newest first — for the user-mgmt list. */
export async function listPendingInvites(): Promise<Invite[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.invite)
    .where(isNull(schema.invite.acceptedAt))
    .orderBy(desc(schema.invite.createdAt));
}

/**
 * Revoke (delete) a pending invite by id. Returns true if a row was removed.
 * Used by the user-management UI's revoke-invite control (Slice 5). `injectedDb`
 * is for tests only.
 */
export async function deleteInvite(
  id: string,
  injectedDb?: Db,
): Promise<boolean> {
  const db = injectedDb ?? (await getDb());
  const [existing] = await db
    .select({ id: schema.invite.id })
    .from(schema.invite)
    .where(eq(schema.invite.id, id))
    .limit(1);
  await db.delete(schema.invite).where(eq(schema.invite.id, id));
  return existing != null;
}

/** Classify an invite token for the accept page (gate before showing the form). */
export async function checkInvite(
  token: string,
  injectedDb?: Db,
): Promise<{ status: InviteStatus; invite: Invite | null }> {
  const invite = await findInviteByToken(token, injectedDb);
  return { status: classifyInvite(invite ? toRecord(invite) : null), invite };
}

export type AcceptInviteResult =
  | { ok: true; user: User }
  | { ok: false; reason: InviteStatus | "emailTaken" };

/**
 * Accept an invite: re-validate the token (so a stale page can't accept an
 * expired/used invite), create the CMS user with the invite's role + the
 * supplied (already-hashed) password, and mark the invite accepted. The
 * email-unique index on `user` is the backstop against a duplicate account.
 */
export async function acceptInvite(
  token: string,
  passwordHash: string,
  injectedDb?: Db,
): Promise<AcceptInviteResult> {
  const db = injectedDb ?? (await getDb());
  const { status, invite } = await checkInvite(token, db);
  if (status !== "valid" || !invite) return { ok: false, reason: status };

  if (await findUserByEmail(invite.email, db)) {
    return { ok: false, reason: "emailTaken" };
  }

  let user: User;
  try {
    user = await createUser(
      {
        email: invite.email,
        passwordHash,
        role: invite.role,
      },
      db,
    );
  } catch {
    return { ok: false, reason: "emailTaken" };
  }

  await db
    .update(schema.invite)
    .set({ acceptedAt: new Date() })
    .where(
      and(eq(schema.invite.id, invite.id), isNull(schema.invite.acceptedAt)),
    );

  return { ok: true, user };
}
