# Backlog — seo-robots
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks

### Edge-cache purge coverage
- TODO: Purge `SITEMAP_CACHE_TAG` + `LLMS_CACHE_TAG` on content-locales settings save
  (`api/settings/content-locales` PUT currently purges only `PAGES_CACHE_TAG`): a locale add/remove
  changes /sitemap.xml (per-locale URLs + hreflang alternates) and /llms.txt (`{{locales}}` slot),
  both now edge-cached with their own tags → stale up to max-age after the write. One-line purge
  extension + update the purge-coverage lists in the two edge-cache CAVEATs. — queued by scrub:
  verified in repo that content-locales/route.ts:74 misses both tags while brand/llms PUTs purge theirs.
  (Re-verified by scrub 2026-07-07 second pass: still purges only PAGES_CACHE_TAG.)

### Lower-value follow-ups
- TODO (follow-up to the AI bulk-meta tool): AI "fix missing alt" path — audit_meta covers only the
  meta title/description gaps; missing image alt (`auditSeo.missingAlt`) is authored inside block
  props, so fixing it needs `set_block_props` (already exists) driven by an alt audit. Consider an
  `audit_alt` read tool (returns missingAlt) + a guide line so the AI knows to set_block_props the
  alt. Lower value than meta (alt is per-image, harder to auto-generate well).
