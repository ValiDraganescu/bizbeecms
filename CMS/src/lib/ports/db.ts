/**
 * `Db` port — the ports-and-adapters seam for data access (binding-adapters
 * subgoal). CMS code depends on this small interface instead of touching the
 * Cloudflare `env.DB` D1 binding directly.
 *
 * Drizzle is already the data layer, so the port is thin: `Db` is simply the
 * drizzle-D1 client type, and `CfDb` is the factory that wraps `env.DB` 1:1 —
 * ZERO behavior change (it's the exact `drizzle(env.DB, { schema })` call that
 * lived in `src/db/index.ts`). NOT in scope: a second (Postgres) adapter — main
 * is "fully Cloudflare-native". We build the socket, not the second plug.
 *
 * This module is the ONLY place that reads `env.DB`. `src/db/index.ts` re-exports
 * `getDb`/`schema` from here, so every existing `@/db` caller is unchanged while
 * the binding read funnels through one seam. That makes db-coupled logic
 * unit-testable by passing a drizzle client over an in-memory D1 (see
 * `scripts/db-port.test.mjs`).
 */
import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "../../db/schema.ts";

/**
 * Data access as the CMS uses it: a drizzle client bound to the per-Site D1
 * schema. The type IS the drizzle-D1 client — drizzle already is the interface,
 * so the port re-homes it rather than reinventing an ORM.
 */
export type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Cloudflare D1 adapter — wraps a `D1Database` (the `env.DB` binding) as a `Db`.
 * A 1:1 pass-through: the same `drizzle(db, { schema })` construction the app
 * used before, so callers behave identically.
 */
export function cfDb(d1: D1Database): Db {
  return drizzle(d1, { schema });
}

/**
 * The adapter factory: resolve the live `Db` from the Cloudflare context. The
 * single reader of `env.DB` in the app. Each deployed CMS Worker has its own D1
 * database, so this client IS scoped to one Site.
 */
export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true });
  return cfDb(env.DB);
}

export { schema };
