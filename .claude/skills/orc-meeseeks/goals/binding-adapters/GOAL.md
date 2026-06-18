# Goal: binding-adapters
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Put a thin **ports-and-adapters seam** between the CMS app code and its Cloudflare
bindings, so CMS modules stop touching `env.DB` / `env.MEDIA` / `env.AI` directly and
instead depend on small interfaces. **In scope now:** the interfaces + a single
**Cloudflare adapter** that wraps today's bindings 1:1 (zero behavior change). **Out of
scope (do NOT build):** a Vercel/Postgres/Blob adapter — main is "fully Cloudflare-native",
so the second adapter is deferred until there's a real reason to leave CF. The seam is the
insurance; we are not filing the claim.

## Why this is worth doing on CF alone (the "do now" rationale)
- **Testability**: with `Db`/`Storage`/`Ai` interfaces, CMS logic is unit-testable by mocking
  the port — no Workers runtime, no live D1/R2/AI needed in tests.
- **One obvious seam**: every binding access funnels through `env`-shaped adapter factory,
  not scattered `env.DB`/`env.MEDIA`/`env.AI` reads.
- **Cheap optionality**: if CF ever fails us, a second adapter is a weekend against a known
  interface, not a rewrite. We build the socket, not the second plug.

## The real seams (verified 2026-06-18)
- **Db** — `CMS/src/db/index.ts` (`drizzle(env.DB, …)`); all data access goes through drizzle.
- **Storage** — `CMS/src/db/asset-store.ts` (`env.MEDIA.put/get/delete`, R2).
- **Ai** — `CMS/src/app/api/chat/route.ts` + `CMS/src/lib/chat/*` (`env.AI.run(model, …)`,
  OpenAI-compatible, streaming).

## What "good" looks like
- Three interfaces (`Db`, `Storage`, `Ai`) + one CF adapter set implementing them over the
  current bindings.
- CMS app/business code imports the interfaces, never `env.DB/MEDIA/AI` directly (the adapter
  factory is the only place that reads `env`).
- At least one unit test that exercises CMS logic against a mocked port (proves the seam earns
  its keep), following the project's testing discipline (no tautological mocks).
- Zero runtime behavior change — a deployed CMS Worker behaves exactly as before. Verified by
  `npx opennextjs-cloudflare build` succeeding (deploy gate) and existing tests still green.
