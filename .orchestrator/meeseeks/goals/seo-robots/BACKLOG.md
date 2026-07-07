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
- DONE (2026-07-07): AI "fix missing alt" path — `audit_alt` read tool (no args) in meta-tools.ts,
  dispatched via `handleAuditAlt` (listPagesForAudit + getContentLocales + listComponents →
  `auditSeo(…, buildComponentSeoIndex(components))`, so it deep-scans component-internal <img> too;
  dedup by slug+src; returns findings + a fix `hint`). Registered in tool-scopes KNOWN_TOOL_NAMES +
  page-builder & pages scopes; guide lines added to both prompts so the AI drives `set_block_props`
  (block-prop images) / `update_component` (component-markup images) from the audit. Build gate green
  (`CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`); full pure suite 1955 pass.
