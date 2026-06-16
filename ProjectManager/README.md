# bizbeecms · ProjectManager

The ProjectManager (PM) app for bizbeecms — a Cloudflare-native multi-site B2B
whitelabel CMS. The PM handles user management, site creation, and
Cloudflare-native site deployment.

## Stack

- **Next.js** (App Router) deployed to **Cloudflare Workers** via
  [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) (OpenNext).
- **Cloudflare D1** for data (added in a later milestone task).
- **Cloudflare KV** for sessions (added in a later milestone task).
- Email + password auth, sessions in D1/KV.
- Site deploys via the Cloudflare API.

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
- `wrangler.jsonc` — Cloudflare Worker config (D1/KV bindings go here).
- `open-next.config.ts` — OpenNext Cloudflare adapter config.
