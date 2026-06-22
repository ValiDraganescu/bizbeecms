import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Role, User } from "@/db/schema";
import { isCountryCode, type CountryCode } from "./countries";
import { getSession } from "./session";

/** Total number of registered users. Drives the first-registrant rule. */
export async function userCount(): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users);
  return row?.count ?? 0;
}

/** True once at least one user exists — registration is closed after that. */
export async function hasAnyUser(): Promise<boolean> {
  return (await userCount()) > 0;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return user ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const db = await getDb();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  return user ?? null;
}

/** The user for the current session, or null if signed out. */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) return null;
  return findUserById(session.userId);
}

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  role: Role;
  /** Country scope set; empty/omitted = global (all countries). */
  countries?: CountryCode[];
  canInvite?: boolean;
};

/** Insert a user (+ its country-scope rows). Email unique index prevents dupes. */
export async function createUser(input: CreateUserInput): Promise<User> {
  const db = await getDb();
  const [user] = await db
    .insert(schema.users)
    .values({
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      canInvite: input.canInvite ?? input.role === "SuperAdmin",
    })
    .returning();

  const countries = input.countries ?? [];
  if (countries.length > 0) {
    await db
      .insert(schema.userCountries)
      .values(countries.map((country) => ({ userId: user.id, country })));
  }
  return user;
}

/** A user's country scope set. Empty array = global (all countries). */
export async function getUserCountries(userId: string): Promise<CountryCode[]> {
  const db = await getDb();
  const rows = await db
    .select({ country: schema.userCountries.country })
    .from(schema.userCountries)
    .where(eq(schema.userCountries.userId, userId));
  return rows.map((r) => r.country).filter(isCountryCode);
}

/** A user's tag scope (pm-roles Slice 3) — tag ids. Empty = no tag reach. */
export async function getUserTagIds(userId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ tagId: schema.userTags.tagId })
    .from(schema.userTags)
    .where(eq(schema.userTags.userId, userId));
  return rows.map((r) => r.tagId);
}

/** Replace a user's country scope with `countries` (delete-all + insert). */
export async function setUserCountries(
  userId: string,
  countries: CountryCode[],
): Promise<void> {
  const db = await getDb();
  await db.delete(schema.userCountries).where(eq(schema.userCountries.userId, userId));
  if (countries.length > 0) {
    await db
      .insert(schema.userCountries)
      .values(countries.map((country) => ({ userId, country })));
  }
}

/** Replace a user's tag scope with `tagIds` (delete-all + insert). */
export async function setUserTags(userId: string, tagIds: string[]): Promise<void> {
  const db = await getDb();
  await db.delete(schema.userTags).where(eq(schema.userTags.userId, userId));
  if (tagIds.length > 0) {
    await db.insert(schema.userTags).values(tagIds.map((tagId) => ({ userId, tagId })));
  }
}

/** Change a user's role. Returns the updated row, or null if no such user. */
export async function setUserRole(userId: string, role: Role): Promise<User | null> {
  const db = await getDb();
  const [user] = await db
    .update(schema.users)
    .set({ role })
    .where(eq(schema.users.id, userId))
    .returning();
  return user ?? null;
}

/** Delete a user (cascades countries/tags/site assignments). False if missing. */
export async function deleteUser(userId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(schema.users)
    .where(eq(schema.users.id, userId))
    .returning({ id: schema.users.id });
  return rows.length > 0;
}

export type UserWithScope = {
  id: string;
  email: string;
  role: Role;
  canInvite: boolean;
  createdAt: User["createdAt"];
  countries: CountryCode[];
  tagIds: string[];
};

/** All users with their country + tag scope, oldest first. */
export async function listUsersWithScope(): Promise<UserWithScope[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.users);
  // ponytail: N+1 over users is fine at PM's user counts; batch if it ever grows.
  return Promise.all(
    rows
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
      .map(async (u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        canInvite: u.canInvite,
        createdAt: u.createdAt,
        countries: await getUserCountries(u.id),
        tagIds: await getUserTagIds(u.id),
      })),
  );
}
