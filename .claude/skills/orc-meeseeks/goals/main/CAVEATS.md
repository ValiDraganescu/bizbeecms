# Caveats — main
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- The repo was bootstrapped from scratch as a git repo by the loop driver (baseline commit `38a2377`). Not a pre-existing codebase.
- Stack is confirmed Cloudflare-native: Next.js on Cloudflare Workers (OpenNext), D1 for data, email+password auth with sessions in D1/KV, Site deploys via Cloudflare API. Do NOT introduce non-Cloudflare infra.
- `../aicms` is a sibling reference project (its own git repo) — read it for patterns, never edit it. NOTE: aicms uses Postgres (`pg`) + Resend, NOT Cloudflare D1/Workers, so it is NOT a deploy reference. Mine it only for AI-agent / server-side component-rendering tricks, not infra.
- The PM app lives at `ProjectManager/` (its own npm package, NOT a workspace). It has its own `node_modules`, `package.json`, `.gitignore`. Run all PM commands from inside `ProjectManager/`.
- PM stack pinned: Next.js 16.2.9 + `@opennextjs/cloudflare` ^1.19 + wrangler ^4. Build = `next build`; Cloudflare bundle = `npx opennextjs-cloudflare build` (emits `.open-next/worker.js`). `.open-next/` and `.next/` are gitignored.
- `wrangler.jsonc` needs `nodejs_compat` AND `global_fetch_strictly_public` compat flags for OpenNext. D1/KV bindings are stubbed as commented TODO there — uncomment + fill IDs when the D1 task runs.
- `next build` auto-rewrites `tsconfig.json` (jsx→react-jsx, adds `.next/dev/types`). This is expected; don't fight it.
- Could NOT verify a real `wrangler deploy` (no Cloudflare account/auth in this env). The build pipeline is verified; actual deploy is a later, auth-dependent task.
- **UI design rules (user-mandated, binding for ALL UI work in PM and CMS):**
  - Use **Tailwind CSS** for styling.
  - Implement a **proper theme with light AND dark modes**.
  - Theme colors MUST be **named by purpose, not by color name** (e.g. `surface`, `surface-muted`, `foreground`, `foreground-muted`, `border`, `primary`, `primary-foreground`, `danger` — NOT `blue-500`, `gray-200`). Define them as CSS variables / Tailwind theme tokens with light+dark values; components reference ONLY these purpose tokens, never raw color names or hex.
  - **Composable components for everything.** Prefer component composition over prop-heavy APIs — e.g. `<Table><TableHeader>…</TableHeader><TableBody>…</TableBody></Table>` rather than passing loads of data/config as a single component's props.
- The CMS app lives at `CMS/` — its OWN npm package (own node_modules/package.json/.gitignore), same pattern as ProjectManager. Run CMS commands from inside `CMS/`. It mirrors PM's OpenNext/wrangler wiring (next 16.2.9, @opennextjs/cloudflare ^1.19, wrangler ^4); dev port is 3602 (PM is 3601). Its `wrangler.jsonc` deliberately has NO D1/KV bindings — the CMS is the plain default Next install this milestone; the PM deploy step will override the Worker `name` per-Site via the Cloudflare API.
