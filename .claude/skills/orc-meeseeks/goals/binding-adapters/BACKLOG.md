# Backlog — binding-adapters
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- TODO: Define the `Storage` port over `CMS/src/db/asset-store.ts` (only the R2 methods actually
  called) + a `CfStorage` adapter wrapping `env.MEDIA`; route asset-store callers through it.
- TODO: Define the `Db` port over `CMS/src/db/index.ts` (the drizzle factory) + a `CfDb` adapter;
  make the adapter factory the only reader of `env.DB`.
- TODO: Define the `Ai` port over `env.AI.run` (preserve streaming + OpenAI-compatible shape) +
  a `CfAi` adapter; route `CMS/src/lib/chat/*` + chat route through it.
- TODO: Add an adapter factory (`env` → `{ db, storage, ai }`) — the single place that reads bindings.
- TODO: One unit test exercising a CMS module against a mocked port (prove the seam; honest assertions).
- TODO: Verify zero behavior change — `npx opennextjs-cloudflare build` green + existing tests pass.
