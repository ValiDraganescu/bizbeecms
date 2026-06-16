import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Role, User } from "@/db/schema";
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
  country?: string | null;
  canInvite?: boolean;
};

/** Insert a user; the email unique index enforces no duplicates at the DB. */
export async function createUser(input: CreateUserInput): Promise<User> {
  const db = await getDb();
  const [user] = await db
    .insert(schema.users)
    .values({
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      country: input.country ?? null,
      canInvite: input.canInvite ?? input.role === "SuperAdmin",
    })
    .returning();
  return user;
}
