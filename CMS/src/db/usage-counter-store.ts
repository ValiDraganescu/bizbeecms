/**
 * public-guest-chatbots Slice 1 — atomic counter store for `usage_counter`
 * (per-Site D1).
 *
 * A generic key→count table meters guest-chat abuse/cost per day. Keys follow
 * `chat:<agentId>:<YYYY-MM-DD>:messages` (enforced against the site-day budget)
 * and `chat:<agentId>:<YYYY-MM-DD>:tokens` (recorded for visibility only). The
 * store never encodes those semantics — the endpoint composes the keys.
 *
 * Increments are atomic: `INSERT … ON CONFLICT DO UPDATE count = count + n`, so
 * concurrent requests racing the same key never lose a bump (icon-store /
 * redirect-store upsert pattern).
 *
 * Reads D1 ONLY via the `Db` port (`getDb()`), never `env.DB` (sole-reader
 * guard); `injectedDb` keeps it node-testable.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";

/**
 * Atomically add `n` to the counter at `key`, creating it at `n` when absent.
 * Returns the resulting count.
 */
export async function incrementCounter(
  key: string,
  n = 1,
  injectedDb?: Db,
): Promise<number> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .insert(schema.usageCounter)
    .values({ key, count: n })
    .onConflictDoUpdate({
      target: schema.usageCounter.key,
      set: { count: sql`${schema.usageCounter.count} + ${n}` },
    })
    .returning({ count: schema.usageCounter.count });
  return rows[0]?.count ?? n;
}

/** Read a single counter; 0 when the key has never been incremented. */
export async function getCounter(key: string, injectedDb?: Db): Promise<number> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ count: schema.usageCounter.count })
    .from(schema.usageCounter)
    .where(eq(schema.usageCounter.key, key))
    .limit(1);
  return rows[0]?.count ?? 0;
}

/** A local `YYYY-MM-DD` day key for `offset` days before `today` (UTC). */
function dayKey(today: Date, offset: number): string {
  const d = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset),
  );
  return d.toISOString().slice(0, 10);
}

/**
 * The last `days` days of message/token usage for one agent, most-recent-first.
 * Computes the day keys in code and batch-reads all of them in one query; days
 * with no activity report zeros (never absent).
 */
export async function readAgentUsage(
  agentId: string,
  days: number,
  injectedDb?: Db,
  now: Date = new Date(),
): Promise<Array<{ day: string; messages: number; tokens: number }>> {
  const db = injectedDb ?? (await getDb());
  const span = Math.max(1, days);
  const dayList = Array.from({ length: span }, (_, i) => dayKey(now, i));

  const keys: string[] = [];
  for (const day of dayList) {
    keys.push(`chat:${agentId}:${day}:messages`);
    keys.push(`chat:${agentId}:${day}:tokens`);
  }

  const rows = await db
    .select({ key: schema.usageCounter.key, count: schema.usageCounter.count })
    .from(schema.usageCounter)
    .where(inArray(schema.usageCounter.key, keys));
  const counts = new Map(rows.map((r) => [r.key, r.count]));

  return dayList.map((day) => ({
    day,
    messages: counts.get(`chat:${agentId}:${day}:messages`) ?? 0,
    tokens: counts.get(`chat:${agentId}:${day}:tokens`) ?? 0,
  }));
}
