import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

/**
 * Returns a drizzle client bound to the Cloudflare D1 `DB` binding for the
 * current request. Use inside route handlers / server actions:
 *
 *   const db = await getDb();
 *   const rows = await db.select().from(schema.users);
 *
 * Relies on the `DB` D1 binding declared in wrangler.jsonc.
 */
export async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return drizzle(env.DB, { schema });
}

/** The drizzle-D1 client type, schema-bound. Used as the injected-Db test seam. */
export type Db = ReturnType<typeof drizzle<typeof schema>>;

export { schema };
