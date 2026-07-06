# Caveats — path-locales-edge-cache
Read every line before working. Each entry was learned the hard way by a previous Meeseeks
(the first batch was established during the 2026-07-07 design conversation).

- The old "path-prefix routing can't deploy to Workers" memory is about **next-intl middleware
  routing in the admin UI** (PM, Next 16). It does NOT apply here: published pages go through our
  own `[[...slug]]` catch-all + `resolvePage` walk. Do NOT reach for next-intl routing for public
  pages — peel the locale segment ourselves.
- **Never add a cookie-based redirect on unprefixed URLs** (e.g. honoring an old `bb_content_locale`
  to bounce `/about` → `/fi/meista`). A cookie-dependent response makes default-locale URLs
  uncacheable — the exact thing this goal exists to gain.
- RSC pages **cannot set response headers**, and Next stamps dynamic pages `no-store`. Cache-Control
  and Cache-Tag must be set in the custom worker entrypoint wrapping `.open-next/worker.js`
  (documented OpenNext pattern: `import { default as handler } from "./.open-next/worker.js"`,
  wrangler `main` → the custom file, re-export DOQueueHandler/DOShardedTagCache if present).
- Workers Cache facts (verified against CF docs 2026-07-07): only GET/HEAD cached; requests with
  `Authorization` and responses with `Set-Cookie` bypass automatically; `Vary: *` disables caching;
  variants purge together; tags ≤1024 ASCII chars, ≤1000 per response, case-insensitive at purge;
  needs wrangler ≥ 4.69.0 (repo has 4.101.0).
- Enabling `"cache"` changes billing: **static-asset requests start billing at standard request
  rate** (they're free today). Small at our traffic, but flag it in the wrangler.jsonc comment.
- The edge cache is **only verifiable on a deployed site** (check `cf-cache-status`). `next dev`
  never runs the custom worker; local `wrangler dev`/preview doesn't enforce the real edge cache.
  Assert headers in unit tests; hit/miss behavior is a HITL check after deploy.
- Link props (`type:"link"`) are single strings and **deliberately not translatable** (see
  `lib/pages/page-blocks.ts` isLinkProp). Localized-slug internal links are solved by render-time
  reverse-resolution in the plan walk — do NOT try to make link props per-locale maps.
- `bb_content_locale` has consumers beyond render-page (`plan-language-switcher.ts` exports
  CONTENT_LOCALE_COOKIE; grep before removing). The switcher script currently cookie+reloads —
  Stage 1 replaces it with navigation.
- Wildcard `:param` slugs and query-param-driven pages must keep working: locale peel happens BEFORE
  the tree walk; wildcards are locale-agnostic; the cache key includes the query string by default.
- Purge calls are best-effort: never fail a publish/save because `ctx.cache.purge` threw (e.g. in
  local dev where it may not exist). Guard with optional chaining + try/catch.
- Never run `npx opennextjs-cloudflare build` while `npm run dev` is running (corrupts .next).
- Project conventions apply: pure helpers dep-free for `node --test`, every UI string in
  messages/{en,fi,et}.json, Drizzle-only migrations, REST route handlers only (no server actions).
- Since locale-prefix routing landed, the built-in LanguageSwitcher is DELIBERATELY inert on
  published pages (cookie+reload no longer changes the render — the URL wins). Do NOT "fix" it
  by re-adding cookie reads to the public path; the fix is the switcher-navigation backlog task.
  Preview/Develop still use the cookie path (`resolveContentLocaleContext` without explicitLocale).
- CMS `.env.local` carries `CMS_DEV_SUPERADMIN=1`; the auth build-failsafe throws in any
  production build. Run the deploy gate as `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`
  (real env vars override `.env.local`). The deployer builds from a clean git checkout, so prod
  is unaffected.
