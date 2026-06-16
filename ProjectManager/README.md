# bizbeecms · ProjectManager

The ProjectManager (PM) app for bizbeecms — a Cloudflare-native multi-site B2B
whitelabel CMS. The PM handles user management, site creation, and
Cloudflare-native site deployment.

## Stack

- **Next.js** (App Router) deployed to **Cloudflare Workers** via
  [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) (OpenNext).
- **Cloudflare D1** for data (binding `DB`), accessed via
  [`drizzle-orm/d1`](https://orm.drizzle.team/docs/get-started-sqlite#cloudflare-d1).
- **Cloudflare KV** for sessions (binding `SESSIONS`).
- Email + password auth, sessions in D1/KV.
- Site deploys via the Cloudflare API.

## Database (Cloudflare D1 + Drizzle)

Schema lives in `src/db/schema.ts` (tables: `users`, `invites`, `sites`,
`site_users`). Access it from route handlers / server actions:

```ts
import { getDb, schema } from "@/db";
const db = await getDb();
const rows = await db.select().from(schema.users);
```

Migration workflow:

```bash
npm run db:generate        # generate SQL into migrations/ from schema.ts
npm run db:migrate:local   # apply migrations to the local D1 (wrangler dev)
npm run db:migrate         # apply migrations to the remote D1
```

The `wrangler.jsonc` `d1_databases`/`kv_namespaces` ids are **placeholders**.
Once Cloudflare auth is available, create the real resources and replace them:

```bash
wrangler d1 create bizbeecms                 # -> database_id
wrangler kv namespace create SESSIONS        # -> id
```

## Local development

```bash
npm install
npm run dev        # Next dev server on http://localhost:3601
```

`next.config.ts` calls `initOpenNextCloudflareForDev()` so Cloudflare bindings
(D1/KV/env) resolve during `next dev` once they are configured in
`wrangler.jsonc`.

## Build & deploy to Cloudflare

```bash
npm run preview    # build with OpenNext and run the Workers preview locally
npm run deploy     # build with OpenNext and deploy to Cloudflare Workers
```

`npm run build` runs the standard `next build` (used by CI / type checks).
`npm run deploy` runs `opennextjs-cloudflare build` then `... deploy`, which
emits the Worker bundle into `.open-next/` per `wrangler.jsonc`.

## Layout

- `src/app/` — App Router pages and route handlers.
- `src/app/api/health/route.ts` — health check (`GET /api/health`).
- `src/db/schema.ts` — Drizzle D1 schema. `src/db/index.ts` — `getDb()` client.
- `drizzle.config.ts` — drizzle-kit config. `migrations/` — generated SQL.
- `wrangler.jsonc` — Cloudflare Worker config (D1 `DB` + KV `SESSIONS`).
- `open-next.config.ts` — OpenNext Cloudflare adapter config.
