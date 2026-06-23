/**
 * CMS-local session persistence (cms-auth Slice 1). CF-coupled: it reads/writes
 * the `session` D1 table via the `Db` port AND sets/reads the `bizbee_session`
 * cookie via `next/headers`, so it's NOT node-loadable. The pure id/record/expiry
 * logic lives in `lib/auth/session-core.ts` (node-tested).
 *
 * Why D1, not KV: the CMS Worker has only a `DB` binding (no KV `SESSIONS` like
 * PM), and the deployer already provisions + migrates D1 per-Site. So the
 * session row lives in D1; the DB is the source of truth, so logout (delete the
 * row) and expiry (`isSessionValid`) are enforced server-side, not trusted from
 * the cookie. D1 has no KV-style auto-TTL, so reads reject expired rows AND
 * delete them opportunistically (a light self-sweep).
 *
 * SLICE-0 NOTE: this is the ONE session notion on the CMS host. Slice 2 rewires
 * `/api/auth/sso-callback` to mint a session HERE (instead of storing PM's sid)
 * and the guard to resolve sessions via `getSession()` (instead of forwarding to
 * PM cms-validate every request).
 */
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/ports/db.ts";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  buildSession,
  isSessionValid,
  type SessionRecord,
} from "../lib/auth/session-core.ts";
import { pruneExpiredSessions } from "./session-prune.ts";

function toRecord(row: typeof schema.session.$inferSelect): SessionRecord {
  const ms = (v: Date | number) => (v instanceof Date ? v.getTime() : Number(v));
  return {
    id: row.id,
    userId: row.userId,
    createdAt: ms(row.createdAt),
    expiresAt: ms(row.expiresAt),
  };
}

/**
 * Create a session for `userId`: persist the row in D1 and set the
 * `bizbee_session` cookie. Call from a route handler. Returns the session id.
 */
export async function createSession(userId: string): Promise<string> {
  const rec = buildSession(userId);
  const db = await getDb();
  await db.insert(schema.session).values({
    id: rec.id,
    userId: rec.userId,
    createdAt: new Date(rec.createdAt),
    expiresAt: new Date(rec.expiresAt),
  });

  (await cookies()).set(SESSION_COOKIE, rec.id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  // Opportunistic sweep of all expired session rows (no cron on the CMS Worker;
  // getSession() only sweeps the one row it reads). Best-effort — a failed prune
  // must never break a fresh login.
  try {
    await pruneExpiredSessions(rec.createdAt, db);
  } catch {
    /* ignore — prune is housekeeping, not on the auth critical path */
  }
  return rec.id;
}

/** The raw session id from the cookie, or null. Does NOT validate against D1. */
export async function getSessionId(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** Read the live session record from D1, or null if absent/expired. */
export async function getSession(): Promise<SessionRecord | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;

  const db = await getDb();
  const [row] = await db.select().from(schema.session).where(eq(schema.session.id, id));
  if (!row) return null;

  const rec = toRecord(row);
  if (!isSessionValid(rec)) {
    // Opportunistic self-sweep (no auto-TTL on D1). Best-effort.
    try {
      await db.delete(schema.session).where(eq(schema.session.id, id));
    } catch {
      /* ignore — expiry is already enforced by the null return */
    }
    return null;
  }
  return rec;
}

/** Destroy the current session: delete the D1 row and clear the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) {
    const db = await getDb();
    await db.delete(schema.session).where(eq(schema.session.id, id));
  }
  jar.delete(SESSION_COOKIE);
}
