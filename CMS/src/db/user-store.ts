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
import { desc, eq } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import type { CmsRole, User } from "./schema.ts";

/** Canonical email form used for storage + lookup (case-insensitive logins). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Find a user by email (normalised), or null. `injectedDb` is for tests only. */
export async function findUserByEmail(
  email: string,
  injectedDb?: Db,
): Promise<User | null> {
  const db = injectedDb ?? (await getDb());
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
 * stored row. `injectedDb` is for tests only (prod resolves via the Db port).
 */
export async function createUser(
  input: {
    email: string;
    passwordHash: string | null;
    role: CmsRole;
  },
  injectedDb?: Db,
): Promise<User> {
  const db = injectedDb ?? (await getDb());
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

/** All CMS users, newest first — for the user-management list (Slice 5). */
export async function listUsers(injectedDb?: Db): Promise<User[]> {
  const db = injectedDb ?? (await getDb());
  return db.select().from(schema.user).orderBy(desc(schema.user.createdAt));
}

/**
 * Set a user's role. Returns the updated row, or null if no such user. The tier
 * rules (`canChangeRole`) are enforced in the route BEFORE this is called — the
 * store just writes. `injectedDb` is for tests only.
 */
export async function updateUserRole(
  id: string,
  role: CmsRole,
  injectedDb?: Db,
): Promise<User | null> {
  const db = injectedDb ?? (await getDb());
  await db.update(schema.user).set({ role }).where(eq(schema.user.id, id));
  const [row] = await db.select().from(schema.user).where(eq(schema.user.id, id));
  return row ?? null;
}

/**
 * Delete a user AND any live sessions they hold (so a removed user is signed
 * out immediately — sessions have no FK cascade). Returns true if a user row was
 * removed. `injectedDb` is for tests only.
 */
export async function deleteUser(
  id: string,
  injectedDb?: Db,
): Promise<boolean> {
  const db = injectedDb ?? (await getDb());
  const existed = (await findById(db, id)) != null;
  await db.delete(schema.session).where(eq(schema.session.userId, id));
  await db.delete(schema.user).where(eq(schema.user.id, id));
  return existed;
}

async function findById(db: Db, id: string): Promise<User | null> {
  const [row] = await db.select().from(schema.user).where(eq(schema.user.id, id));
  return row ?? null;
}
