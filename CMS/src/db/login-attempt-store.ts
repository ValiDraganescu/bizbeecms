/**
 * D1 persistence for failed-login + reset-request throttling (cms-auth
 * brute-force protection). CF-coupled (reads/writes the `login_attempt` D1 table
 * via the `Db` port), so NOT node-loadable — the pure decision lives in
 * `lib/auth/throttle-core.ts` (node-tested). No KV on the CMS Worker, so the
 * sliding-window counter is in D1.
 *
 * `kind` namespaces the counter per surface ('login' | 'forgot') so spamming the
 * forgot-password endpoint can't lock out login (and vice versa). Email is
 * normalised (lowercased) by the caller before reaching here.
 * `injectedDb` is for tests only (prod resolves via the Db port; never reads
 * `env.DB` directly, so the sole-reader guard stays green).
 */
import { eq, gt, lt, and } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import { windowStart } from "../lib/auth/throttle-core.ts";

/** Which surface a throttle counter belongs to. 'form' rides the same table for
 *  public Form-block submissions — the `email` column then holds `form:<ip>`
 *  (same sliding-window shape; the form window ⊂ the 15-min store window, so
 *  the shared read filter + prune stay correct). */
export type AttemptKind = "login" | "forgot" | "form" | "chat";

/**
 * Failure timestamps (epoch ms) recorded for `email`/`kind` inside the current
 * window. Feed these to `decideThrottle`.
 */
export async function recentFailureTimestamps(
  email: string,
  now: number = Date.now(),
  kind: AttemptKind = "login",
  injectedDb?: Db,
): Promise<number[]> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ createdAt: schema.loginAttempt.createdAt })
    .from(schema.loginAttempt)
    .where(
      and(
        eq(schema.loginAttempt.email, email),
        eq(schema.loginAttempt.kind, kind),
        gt(schema.loginAttempt.createdAt, new Date(windowStart(now))),
      ),
    );
  return rows.map((r) => (r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt)));
}

/** Record one attempt for `email`/`kind`. */
export async function recordFailure(
  email: string,
  now: number = Date.now(),
  kind: AttemptKind = "login",
  injectedDb?: Db,
): Promise<void> {
  const db = injectedDb ?? (await getDb());
  await db.insert(schema.loginAttempt).values({
    id: crypto.randomUUID(),
    email,
    kind,
    createdAt: new Date(now),
  });
  // Opportunistic prune: rows older than the window count toward no throttle and
  // (for 'forgot') are never cleared on success, so they'd accumulate forever.
  // Sweep all aged-out rows (any email/kind) here — recordFailure is the only
  // write that's low-volume yet covers every surface. ponytail: piggybacked on
  // the write path; promote to a cron only if a Site's failure volume ever makes
  // this DELETE measurably hurt the login path.
  await db
    .delete(schema.loginAttempt)
    .where(lt(schema.loginAttempt.createdAt, new Date(windowStart(now))));
}

/** Clear an email's attempts for `kind` (call on a successful login). */
export async function clearFailures(
  email: string,
  kind: AttemptKind = "login",
  injectedDb?: Db,
): Promise<void> {
  const db = injectedDb ?? (await getDb());
  await db
    .delete(schema.loginAttempt)
    .where(and(eq(schema.loginAttempt.email, email), eq(schema.loginAttempt.kind, kind)));
}
