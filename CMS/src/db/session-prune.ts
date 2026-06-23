/**
 * Opportunistic prune of expired `session` rows (cms-auth). Split out of
 * `session-store.ts` so it can be node-tested over an in-memory node:sqlite:
 * this module imports ONLY the `Db` port (NO `next/headers`), so unlike
 * `session-store.ts` it's node-`--test` loadable. It reads D1 exclusively via
 * `getDb()` (the Db port), never `env.DB`, so the sole-reader guard stays green.
 *
 * Why: `getSession()` only self-sweeps the ONE expired row it happens to read.
 * A user whose 7-day session expires and never returns leaves a dead row
 * forever, so the table would grow unbounded. This sweeps ALL expired rows. It's
 * piggybacked on `createSession` (the low-volume session-write path) rather than
 * a cron — the CMS Worker has NO scheduled handler. Mirrors the `login_attempt`
 * prune in `login-attempt-store.ts`.
 */
import { lte } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";

/**
 * Delete every `session` row whose `expiresAt` is at or before `now` (epoch ms).
 * Expired rows are already rejected by `getSession()`, so removing them changes
 * no auth decision — it only bounds table growth. `injectedDb` is for tests.
 * ponytail: piggybacked on the write path; promote to a cron only if a Site's
 * session volume ever makes this DELETE measurably hurt the login path.
 */
export async function pruneExpiredSessions(
  now: number = Date.now(),
  injectedDb?: Db,
): Promise<void> {
  const db = injectedDb ?? (await getDb());
  await db.delete(schema.session).where(lte(schema.session.expiresAt, new Date(now)));
}
