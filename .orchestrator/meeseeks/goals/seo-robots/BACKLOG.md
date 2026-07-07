# Backlog — seo-robots
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks

### Edge-cache purge coverage
- DONE (2026-07-07): Purge `SITEMAP_CACHE_TAG` + `LLMS_CACHE_TAG` on content-locales settings save.
  `api/settings/content-locales` PUT now purges all three tags (was PAGES only). Both edge-cache
  CAVEATs' purge-coverage lists updated (SITEMAP → 5 sites, LLMS → 7 sites).

### Lower-value follow-ups
- TODO (follow-up to the AI bulk-meta tool): AI "fix missing alt" path — audit_meta covers only the
  meta title/description gaps; missing image alt (`auditSeo.missingAlt`) is authored inside block
  props, so fixing it needs `set_block_props` (already exists) driven by an alt audit. Consider an
  `audit_alt` read tool (returns missingAlt) + a guide line so the AI knows to set_block_props the
  alt. Lower value than meta (alt is per-image, harder to auto-generate well).
