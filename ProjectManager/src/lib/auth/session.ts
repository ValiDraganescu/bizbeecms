import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Session management backed by the Cloudflare KV `SESSIONS` binding.
 *
 * A session is an opaque random id stored in an httpOnly cookie; the id maps to
 * a small JSON record in KV (`userId`, timestamps). KV holds the source of
 * truth, so logout/expiry is enforced server-side (delete the KV key) rather
 * than trusting cookie contents. KV's own TTL garbage-collects expired records.
 */

export const SESSION_COOKIE = "bizbee_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const KV_PREFIX = "session:";

export type SessionRecord = {
  userId: string;
  createdAt: number;
  expiresAt: number;
};

async function sessionsKv() {
  const { env } = await getCloudflareContext({ async: true });
  return env.SESSIONS;
}

function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create a session for `userId`, persist it in KV with a matching TTL, and set
 * the session cookie on the response. Call from a server action / route handler.
 */
export async function createSession(userId: string): Promise<void> {
  const id = newSessionId();
  const now = Date.now();
  const record: SessionRecord = {
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  };

  const kv = await sessionsKv();
  await kv.put(KV_PREFIX + id, JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  (await cookies()).set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * The raw session id from the cookie (the opaque KV key), or null if absent.
 * Used by the CMS SSO handoff to transport a valid session id to the CMS host.
 * Does NOT validate against KV — callers that need a live session use getSession.
 */
export async function getSessionId(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** Read the current session record from KV, or null if absent/expired. */
export async function getSession(): Promise<SessionRecord | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;

  const kv = await sessionsKv();
  const raw = await kv.get(KV_PREFIX + id);
  if (!raw) return null;

  let record: SessionRecord;
  try {
    record = JSON.parse(raw) as SessionRecord;
  } catch {
    return null;
  }

  if (record.expiresAt <= Date.now()) {
    await kv.delete(KV_PREFIX + id);
    return null;
  }
  return record;
}

/** Destroy the current session: delete the KV record and clear the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) {
    const kv = await sessionsKv();
    await kv.delete(KV_PREFIX + id);
  }
  jar.delete(SESSION_COOKIE);
}
