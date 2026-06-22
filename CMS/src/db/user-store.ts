/**
 * D1 persistence for CMS-local users (cms-auth Slice 1). CF-coupled (uses the
 * `Db` port → `env.DB`), so NOT node-loadable; the pure crypto lives in
 * `lib/auth/password.ts` (node-tested). Each deployed CMS Worker has its own D1,
 * so a user here belongs to THIS one Site (the DB IS the boundary — no siteId).
 *
 * Email is the login identity; it's normalised (trim + lowercase) before every
 * write and lookup so casing can't create duplicate accounts. The plaintext
 * password never touches this layer — callers hash it via `hashPassword` first.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/ports/db.ts";
import type { CmsRole, User } from "./schema.ts";

/** Canonical email form used for storage + lookup (case-insensitive logins). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Find a user by email (normalised), or null. */
export async function findUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, normalizeEmail(email)));
  return row ?? null;
}

/** Find a user by id, or null. */
export async function findUserById(id: string): Promise<User | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.user).where(eq(schema.user.id, id));
  return row ?? null;
}

/**
 * Create a user. `passwordHash` is null for SSO-only / Google-only users.
 * Throws if the email already exists (the unique index enforces it). Returns the
 * stored row.
 */
export async function createUser(input: {
  email: string;
  passwordHash: string | null;
  role: CmsRole;
}): Promise<User> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(schema.user).values({
    id,
    email: normalizeEmail(input.email),
    passwordHash: input.passwordHash,
    role: input.role,
  });
  const [stored] = await db.select().from(schema.user).where(eq(schema.user.id, id));
  return stored;
}
