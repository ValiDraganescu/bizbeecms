import { and, eq, isNull, inArray, desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Invite, Role, User } from "@/db/schema";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";
import { hashPassword } from "@/lib/auth/password";
import { createUser, findUserByEmail } from "@/lib/auth/user";

/** Invite lifetime: 7 days from creation. */
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/** Opaque, URL-safe invite token (32 random bytes, hex). */
function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type CreateInviteInput = {
  email: string;
  role: Role;
  /** Country scope set; empty = global (all countries). */
  countries: CountryCode[];
  /** Tag scope (Manager only); empty = no tag reach. */
  tagIds?: string[];
  invitedBy: string;
};

/** Create a pending invite (+ its country/tag-scope rows). Returns the invite row. */
export async function createInvite(input: CreateInviteInput): Promise<Invite> {
  const db = await getDb();
  const now = Date.now();
  const [invite] = await db
    .insert(schema.invites)
    .values({
      id: crypto.randomUUID(),
      email: input.email,
      role: input.role,
      invitedBy: input.invitedBy,
      token: newInviteToken(),
      expiresAt: new Date(now + INVITE_TTL_MS),
    })
    .returning();

  if (input.countries.length > 0) {
    await db
      .insert(schema.inviteCountries)
      .values(input.countries.map((country) => ({ inviteId: invite.id, country })));
  }
  const tagIds = input.tagIds ?? [];
  if (tagIds.length > 0) {
    await db
      .insert(schema.inviteTags)
      .values(tagIds.map((tagId) => ({ inviteId: invite.id, tagId })));
  }
  return invite;
}

/** An invite's tag scope set (Manager invites). Empty array = no tag reach. */
export async function getInviteTags(inviteId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ tagId: schema.inviteTags.tagId })
    .from(schema.inviteTags)
    .where(eq(schema.inviteTags.inviteId, inviteId));
  return rows.map((r) => r.tagId);
}

/** Tag sets for many invites at once, keyed by invite id (for the list). */
export async function getInviteTagsMap(
  inviteIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (inviteIds.length === 0) return map;
  const db = await getDb();
  const rows = await db
    .select({
      inviteId: schema.inviteTags.inviteId,
      tagId: schema.inviteTags.tagId,
    })
    .from(schema.inviteTags)
    .where(inArray(schema.inviteTags.inviteId, inviteIds));
  for (const row of rows) {
    const list = map.get(row.inviteId) ?? [];
    list.push(row.tagId);
    map.set(row.inviteId, list);
  }
  return map;
}

/** An invite's country scope set. Empty array = global (all countries). */
export async function getInviteCountries(
  inviteId: string,
): Promise<CountryCode[]> {
  const db = await getDb();
  const rows = await db
    .select({ country: schema.inviteCountries.country })
    .from(schema.inviteCountries)
    .where(eq(schema.inviteCountries.inviteId, inviteId));
  return rows.map((r) => r.country).filter(isCountryCode);
}

/** Country sets for many invites at once, keyed by invite id (for the list). */
export async function getInviteCountriesMap(
  inviteIds: string[],
): Promise<Map<string, CountryCode[]>> {
  const map = new Map<string, CountryCode[]>();
  if (inviteIds.length === 0) return map;
  const db = await getDb();
  const rows = await db
    .select({
      inviteId: schema.inviteCountries.inviteId,
      country: schema.inviteCountries.country,
    })
    .from(schema.inviteCountries)
    .where(inArray(schema.inviteCountries.inviteId, inviteIds));
  for (const row of rows) {
    if (!isCountryCode(row.country)) continue;
    const list = map.get(row.inviteId) ?? [];
    list.push(row.country);
    map.set(row.inviteId, list);
  }
  return map;
}

/** Pending (not yet accepted) invites, newest first — for the invite list. */
export async function listPendingInvites(): Promise<Invite[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.invites)
    .where(isNull(schema.invites.acceptedAt))
    .orderBy(desc(schema.invites.createdAt));
}

export async function findInviteByToken(token: string): Promise<Invite | null> {
  const db = await getDb();
  const [invite] = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.token, token))
    .limit(1);
  return invite ?? null;
}

export type InviteStatus = "valid" | "notFound" | "expired" | "accepted";

/** Classify an invite token for the accept page (gate before showing the form). */
export async function checkInvite(
  token: string,
): Promise<{ status: InviteStatus; invite: Invite | null }> {
  const invite = await findInviteByToken(token);
  if (!invite) return { status: "notFound", invite: null };
  if (invite.acceptedAt) return { status: "accepted", invite };
  if (invite.expiresAt.getTime() <= Date.now())
    return { status: "expired", invite };
  return { status: "valid", invite };
}

export type AcceptInviteResult =
  | { ok: true; user: User }
  | { ok: false; reason: InviteStatus | "emailTaken" };

/**
 * Accept an invite: re-validate the token, create the user from the invite's
 * role/country, and mark the invite accepted. Re-checks status inside here so a
 * stale page can't accept an expired/used invite. The email-unique index is the
 * backstop against a duplicate account.
 */
export async function acceptInvite(
  token: string,
  password: string,
): Promise<AcceptInviteResult> {
  const { status, invite } = await checkInvite(token);
  if (status !== "valid" || !invite) return { ok: false, reason: status };

  if (await findUserByEmail(invite.email)) {
    return { ok: false, reason: "emailTaken" };
  }

  const countries = await getInviteCountries(invite.id);
  const tagIds = await getInviteTags(invite.id);
  const passwordHash = await hashPassword(password);
  let user: User;
  try {
    user = await createUser({
      email: invite.email,
      passwordHash,
      role: invite.role,
      countries,
      tagIds,
      // Invited users don't get invite rights by default; a SuperAdmin can
      // grant canInvite later when that management UI exists.
      canInvite: false,
    });
  } catch {
    return { ok: false, reason: "emailTaken" };
  }

  const db = await getDb();
  await db
    .update(schema.invites)
    .set({ acceptedAt: new Date() })
    .where(
      and(eq(schema.invites.id, invite.id), isNull(schema.invites.acceptedAt)),
    );

  return { ok: true, user };
}

/**
 * Revoke a PENDING invite by id (delete the row → its accept link dies).
 * Scope-row cleanup is handled by the FK cascade on `invite_countries`/
 * `invite_tags`. Returns true if a pending invite was deleted, false if none
 * matched (unknown id or already accepted/revoked) → 404.
 */
export async function deleteInvite(id: string): Promise<boolean> {
  const db = await getDb();
  const deleted = await db
    .delete(schema.invites)
    .where(
      and(eq(schema.invites.id, id), isNull(schema.invites.acceptedAt)),
    )
    .returning({ id: schema.invites.id });
  return deleted.length > 0;
}

/** True if a pending invite already exists for this email. */
export async function hasPendingInvite(email: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .where(
      and(eq(schema.invites.email, email), isNull(schema.invites.acceptedAt)),
    )
    .limit(1);
  return row != null;
}
