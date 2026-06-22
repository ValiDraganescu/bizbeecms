/**
 * PURE session primitives for the per-Site CMS (cms-auth Slice 1).
 *
 * The CMS gets its OWN session store. Unlike PM (which uses a KV `SESSIONS`
 * binding), the CMS Worker has NO KV binding — only D1 (the `DB` binding, which
 * the deployer already provisions + migrates per-Site). So the session record
 * is persisted in a D1 `session` table (see schema.ts), keyed by an opaque
 * random id held in the `bizbee_session` cookie. The DB is the source of truth,
 * so logout/expiry are enforced server-side (delete the row / check expiresAt).
 *
 * This module is the PURE half — no `@/` imports, no CF bindings, no cookies —
 * so it's node-`--test` loadable (only `globalThis.crypto`, present on Workers
 * and Node 20+). The D1-bound + cookie-bound half lives in `db/session-store.ts`.
 *
 * SLICE-0 NOTE: the cookie NAME stays `bizbee_session` (same as PM + the
 * existing SSO callback on the CMS host — a different host than PM, so no real
 * collision), but its VALUE meaning becomes a CMS-LOCAL session id. Rewiring the
 * SSO callback to mint a local session is Slice 2, not this slice.
 */

export const SESSION_COOKIE = "bizbee_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days (mirrors PM)

export type SessionRecord = {
  id: string;
  userId: string;
  createdAt: number; // epoch ms
  expiresAt: number; // epoch ms
};

/** A fresh opaque 32-byte session id as lowercase hex (the cookie value). */
export function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build a session record for `userId` starting at `now` (epoch ms; injectable
 * for tests). The id can be supplied (tests) or is generated. Pure — the caller
 * persists it + sets the cookie.
 */
export function buildSession(
  userId: string,
  now: number = Date.now(),
  id: string = newSessionId(),
): SessionRecord {
  return {
    id,
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  };
}

/** True if the record is still live at `now` (epoch ms). */
export function isSessionValid(
  record: Pick<SessionRecord, "expiresAt">,
  now: number = Date.now(),
): boolean {
  return record.expiresAt > now;
}
