# bizbeecms — CMS

The per-Site **CMS** for [bizbeecms](../README.md): a Cloudflare-native multi-site
B2B whitelabel CMS. The **ProjectManager** ([`../ProjectManager`](../ProjectManager))
deploys one instance of this app per Site to Cloudflare Workers.

For this milestone the CMS is the **default Next.js install** (App Router), wired
for Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare) so the
PM's deploy step can ship it as a Worker.

## Stack

- Next.js 16 (App Router) + React 19
- `@opennextjs/cloudflare` → Cloudflare Workers bundle
- `wrangler` for deploy/preview

## Develop

```bash
npm install
npm run dev        # http://localhost:3602
```

Routes:

- `/` — hello-world landing page
- `GET /api/health` — JSON health check

## Build & Cloudflare bundle

```bash
npm run build      # next build
npx opennextjs-cloudflare build   # emits .open-next/worker.js + assets
```

## Deploy

```bash
npm run deploy     # opennextjs-cloudflare build && deploy (needs Cloudflare auth)
```

When the PM provisions a Site it overrides the Worker `name` (e.g.
`bizbeecms-cms-<site-slug>`) via the Cloudflare API. `name` in `wrangler.jsonc`
is just the local/default name.

## Notes

- Run all CMS commands from inside `CMS/` (separate npm package, own `node_modules`).
- `.open-next/`, `.next/`, `.wrangler/` are gitignored.
