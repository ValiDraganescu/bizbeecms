# Backlog — main
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- DOING: Site deployment — PM calls Cloudflare API to provision a CMS Worker per Site; report deploy status. Must work from the deployed PM.
  - DONE (engine core): `lib/deploy/` Cloudflare Workers Script-Upload API client + deploy orchestration state-machine (draft→deploying→deployed/failed) + data-layer `setSiteDeployStatus`. Pure parts unit-tested (`npm test`, 6/6); tsc + opennextjs-cloudflare build clean. No live CF auth → live upload not exercised.
  - DONE: **CMS bundle production** — committed pre-bundled artifact: `scripts/build-cms-bundle.mjs` esbuild-bundles `CMS/.open-next/worker.js` (+~980 chunks) into ONE ~3.9MB self-contained ESM module → committed `src/lib/deploy/cms-bundle.generated.js`; `buildCmsBundle()` loader returns the engine's `{mainModule,files}` shape. Verified tsc + 9/9 tests + opennextjs-cloudflare build. Live boot-on-Worker unverified (no CF auth). See CAVEATS "CMS bundle".
  - DONE: deploy UI — `deploySiteAction` (authz: country-reach OR site_users assignment) + Deploy/Redeploy button & status on Site detail page wired through `deploySite`+`buildCmsBundle`; `sites.deploy.*` i18n in EN/FI/ET (parity verified). tsc + 9/9 tests + opennextjs-cloudflare build clean. Live deploy path still unexercised (no CF auth).
  - TODO (next): real end-to-end deploy against a live Cloudflare account/token (set `CF_API_TOKEN`/`CF_ACCOUNT_ID` secrets; needs auth in env).
- TODO (next deploy slice — BLOCKS a functional live deploy): **Upload CMS static assets alongside the worker.** The worker `env.ASSETS.fetch`-es `.open-next/assets` (14 files, ~700KB) but the deploy uploads only the JS module → assets 404 on a live deploy. Implement Cloudflare's **Workers Assets API**: create an upload session (`POST .../workers/scripts/{name}/assets-upload-session` with a manifest of file hashes+sizes) → PUT the missing files in buckets → receive a completion JWT → pass it as `metadata.assets.jwt` (+`config`) in `buildScriptUploadForm`. Needs the asset bytes available at deploy time — extend `build-cms-bundle.mjs` to also emit the assets (hash+content) into the committed artifact (or a sibling), since deploy runs from the deployed PM and can't read `.open-next/`. Verify request-building offline (unit-test the manifest/metadata shape); the live PUT needs a CF account. Alternative: switch deploy to wrangler's assets-aware upload. See DEPLOY.md step 11 🚧 + CAVEAT "static-assets gap".
- SUPERSEDED (M1 deploy now works live via the deployer Container, not Script-Upload — these Script-Upload/asset-upload tasks are moot): the two "Upload CMS static assets via Workers Assets API" / "real end-to-end deploy" TODOs above. The container path (`opennextjs build && wrangler deploy`) handles assets+bindings natively. See memory `pm-cms-deploy-via-container`.
- (vision) business developers managing many client sites build a personal/shared library and import their components into each new Site. A future shared registry is the natural extension (defer).

**G. Premade component kits (starter library)**
> Built on H — a kit is a curated, versioned export bundle the CMS ships with and can import into any Site.
- DONE (2026-06-19): **G5 — pricing / e-commerce component kit.** `CMS/src/lib/components/pricing-kit.ts` (5 bundles: PricingHeader, PricingTier, FeatureRow, ProductCard, PricingFaqItem — `{{slots}}`+propsSchema; ProductCard uses inline `style` aspectRatio/objectFit, no aspect-ratio class; money/URL props non-translatable) + `{id:"pricing",...}` to KITS registry (route) + KITS const (manager) + `installPricingKit` i18n (EN/FI/ET) + extended `kitsHint` + `scripts/pricing-kit.test.mjs` (6). No new write/validation path. CMS 359/359, tsc, opennext gate, PM bundle 6663KB + 79/79. Live D1 → HITL P1.
- (later) Gxx — more kits (events, restaurant/menu, real-estate, team/about) follow the SAME pattern: new `lib/components/<x>-kit.ts` + add `{id,build,names}` to the `KITS` registry in `api/components/kit/route.ts` + `{id,labelKey}` to the `KITS` const in `components-manager.tsx` + an `install<X>Kit` i18n key (3 catalogs) + a `scripts/<x>-kit.test.mjs`.

**UX. Admin shell**
- Sequencing: do A (rendering) fully before B (AI), or interleave A1→A2→B1→B2 as one vertical thread?
- ~~entity types~~ RESOLVED: no entities — content is generic Pages; "blog" = a page that lists pages + the G1 premade component kit.
- "PostList lists child pages" — how does a page know it's a blog post? A tag/type field on `page`, or just parent-child hierarchy (children of the blog page = posts)? (affects A1 schema + G1)
- ~~AI provider~~ RESOLVED: Cloudflare-native — Workers AI (`env.AI`) behind AI Gateway; swappable to a stronger model via the gateway if tool-calling needs it (see B1 risk).
- Is the non-AI manual editor (C2/C3) needed for v1, or is the AI the only authoring path initially?
