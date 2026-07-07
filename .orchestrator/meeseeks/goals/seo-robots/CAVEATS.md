# Caveats — seo-robots
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- (seeded by curator, 2026-07-07) `CMS/worker.ts` ships ONLY via a release tag (r-*) — worker changes
  are invisible on deployed sites until a release is cut. Don't cut releases yourself (release manager
  owns them); note HITL verification as pending instead.
- (seeded) Google retired sitemap ping (June 2023) and does not support IndexNow. Don't add a Google
  ping call — it 404s. Sitemap + robots pointer is the Google path.
- (seeded, after commits 7709a01 + a5aa278) Published-page bytes are PROVABLY visitor-independent —
  the `(site)/(admin)` root-layout split keeps next-intl and all Accept-Language/cookie-varying bytes
  out of published output (fenced by site-layout-isolation.test.ts). JSON-LD rendering and anything
  else this goal adds to published pages must preserve that: never interpolate request/visitor-varying
  data into published HTML, and never import next-intl (or `next/headers` locale resolvers) into the
  `(site)` render path — it re-poisons the edge cache.
- (seeded) Adjacent prior art lives in `goals/path-locales-edge-cache/` (ACTIVE): sitemap.ts,
  hreflang/localize-paths, worker.ts edge-cache gate, purge-edge.ts best-effort pattern. Read its
  CAVEATS before touching those files — several designs there are deliberately partial and look like
  bugs but aren't.
- (2026-07-07) `isEdgeCacheCandidate` rejects ALL dotted single-segment root paths — /sitemap.xml,
  /robots.txt, /llms.txt, the IndexNow /<key>.txt are ALREADY edge-cache-excluded. Do NOT add
  per-route exclusions when building those routes; the dot gate covers them (root-level only —
  deeper dotted wildcard URLs stay cacheable, fenced in edge-cache.test.ts).
- (2026-07-07) sitemap lastmod = `page.updatedAt`, which OVER-reports on two paths: getDraft
  auto-create and restore-to-draft bump it without changing published bytes (deliberate — it also
  drives admin "recently edited"). saveDraftBlocks correctly does NOT bump. Don't "fix" by making
  version-store writes stop bumping without checking the admin pages list; a real fix needs a
  separate live-content timestamp. Component/theme/brand publishes change rendered HTML without
  bumping any page.updatedAt — known lastmod gap, accepted.
