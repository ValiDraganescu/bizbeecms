/**
 * Data access entry point. The actual seam lives in the `Db` port
 * (`@/lib/ports/db`) — the SOLE reader of the `env.DB` D1 binding — and this
 * module just re-exports it so the established `@/db` import surface
 * (`getDb`, `schema`) is unchanged for every caller.
 *
 *   const db = await getDb();
 *   const pages = await db.select().from(schema.page);
 */
export { getDb, schema, cfDb } from "@/lib/ports/db";
export type { Db } from "@/lib/ports/db";
