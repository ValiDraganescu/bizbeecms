import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

/**
 * Returns a drizzle client bound to the per-Site Cloudflare D1 `DB` binding for
 * the current request. Use inside route handlers / server components:
 *
 *   const db = await getDb();
 *   const pages = await db.select().from(schema.page);
 *
 * Relies on the `DB` D1 binding declared in CMS wrangler.jsonc. Each deployed
 * CMS Worker has its own D1 database, so this client IS scoped to one Site.
 */
export async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return drizzle(env.DB, { schema });
}

export { schema };
