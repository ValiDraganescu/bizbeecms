# CMS — working notes for Claude

## Database & D1

- **`npm run dev` (port 3602) reads the LOCAL D1** at `.wrangler/state/v3/d1` (gitignored
  miniflare SQLite). `wrangler.jsonc` has a placeholder `database_id`
  (`00000000-…`) and no `experimental.remoteBindings`, so the `DB` binding is local.
- The **AI binding is always remote** — the "⎔ Establishing remote connection" line in
  the dev log is the AI binding (and incurs charges), NOT D1. Don't read it as "D1 is remote".
- **Production / deployed Sites** get their own real D1, provisioned by the deployer Worker,
  which injects the real `database_id` at deploy time. That id is not in this repo.
- To inspect/seed the dev DB: `npx wrangler d1 execute bizbeecms-cms --local --command "…"`.
- **The local D1 was originally seeded from a copy of a remote snapshot.** That snapshot
  carried the schema/data but not a matching `d1_migrations` ledger, so the ledger can lag
  the actual schema (the source of any "duplicate column" drift). Fix by reconciling the
  ledger (see Migrations), never by re-running SQL.

## Migrations — Drizzle ONLY

- **NEVER hand-write a migration SQL file, and never run a raw `ALTER TABLE` against the DB
  to change schema.** The migration ledger (`d1_migrations`) drifts from reality the moment
  you do, and `wrangler d1 migrations apply` then fails with "duplicate column".
- The ONLY way to change schema:
  1. Edit `src/db/schema.ts`.
  2. `npm run db:generate`  (drizzle-kit emits the SQL into `migrations/`).
  3. `npx wrangler d1 migrations apply bizbeecms-cms --local`  (and `--remote` for prod).
- If `migrations apply` reports drift (a column "already exists"), the fix is to reconcile
  the **ledger** (record the already-applied migration name in `d1_migrations`), never to
  re-run or hand-edit SQL.

## Build / dev

- Use `npm run dev` for iterating — hot reload, no build, no `rm -rf .next` needed.
- `npx opennextjs-cloudflare build` is the deploy gate (a pre-commit check only). NEVER run it
  while `npm run dev` is running — it corrupts `.next` and 500s the server. Stop dev first.
- Releases are owned by a release manager — finish + report, don't offer to cut/redeploy.

## Architecture reminders

- **REST routes only — no server actions** (they 500 on OpenNext/Workers).
- Pure helper modules avoid `@/`/React/D1/CF imports so they run under dep-free `node --test`.
