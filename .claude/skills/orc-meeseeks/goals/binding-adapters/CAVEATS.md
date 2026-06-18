# Caveats — binding-adapters
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **Do NOT build a Vercel/Postgres/Blob adapter.** main is "fully Cloudflare-native". Only the
  interfaces + the CF adapter are in scope. A second, unused, untested adapter is debt — skip it.
- **Zero behavior change.** This is a refactor. The deployed CMS Worker must behave identically.
  Don't "improve" the data/storage/AI logic while extracting it — extract only.
- **The deploy gate is `npx opennextjs-cloudflare build`** (runs `next build` internally). NEVER run
  it while `npm run dev` is on 3601/3602 — it corrupts `.next` and 500s the server. Stop dev first.
- **Drizzle is already a layer.** The `Db` port likely wraps the drizzle instance (or its factory),
  not raw `env.DB`. Don't reinvent an ORM — `CMS/src/db/index.ts` is the seam.
- **R2 access is native (`env.MEDIA.put/get/delete`, no presigning)** per `asset-store.ts`. Keep the
  `Storage` port minimal — only the methods actually called.
- **Workers AI is OpenAI-compatible + streaming** (`env.AI.run(model, {messages, stream})`). The `Ai`
  port must preserve streaming; don't collapse it to a non-streaming call.
- **Testing discipline is enforced** (orc-test-review). No tautological mocks, no
  `toHaveBeenCalledWith` on internal collaborators. The mock-the-port test must assert real behavior.
