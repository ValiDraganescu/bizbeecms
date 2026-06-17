import type { Config } from "drizzle-kit";

/**
 * drizzle-kit config for the per-Site bizbeecms CMS D1 database.
 *
 * `drizzle-kit generate` reads the schema and emits SQL migrations into
 * `migrations/`. Apply them to a Site's D1 with:
 *   wrangler d1 migrations apply <db-name>            (remote)
 *   wrangler d1 migrations apply <db-name> --local    (local dev)
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  driver: "d1-http",
} satisfies Config;
