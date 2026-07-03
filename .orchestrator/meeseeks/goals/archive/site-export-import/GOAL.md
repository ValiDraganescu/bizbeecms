# Goal: site-export-import
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Full-site **export → import** for the CMS: export EVERYTHING that makes a site (pages, components, collections + their rows, external data sources, gallery/R2 assets, theme, brand identity, locales, prompts, forms config) from one CMS instance into a portable artifact (single blob/archive preferred — whatever is Workers-compatible), and import that artifact into ANOTHER CMS instance, **de-facto resetting the target's content database** before restoring. User's words: "export pages, components, collections, external datasources, gallery images, the database, everything… import it into another cms instance de facto resetting that CMS database and importing the export."

## What "everything" means here (verified against CMS/src/db/schema.ts, 18 core tables + dynamic content_*)

**EXPORT (content + design + data):**
- `page`, `page_version` (at minimum current draft+live; full version history optional — decide and note), `component`, `collection` (schemas) + every dynamic `content_*` table's ROWS, `site_settings` (theme, brand identity, content locales, AI persona/prompts config…), `prompt_version`, `asset` table + the actual **R2 binary objects** (gallery images etc.), `data_source` + `data_source_request`.
- **Data-source secrets CANNOT be exported decrypted** — they're write-only, encrypted with the instance KEK; ciphertext is useless on another instance. Export the source definitions + `hasSecret` flags; the import report must list which sources need their secret re-entered. This is a hard constraint, not a choice.

**DO NOT export (instance identity / transients) — default decision, flag in the import report:**
- `user`, `session`, `invite`, `password_reset`, `login_attempt`, `api_key` (target instance keeps its own auth/keys; PM-SSO maps site access per-instance), `icon_cache` (cache), `chat_thread` (AI history is instance-local; include later only if asked).

**IMPORT (destructive, operator-only):**
- Validate the artifact (manifest + format version + CMS version compat) → show/return a dry-run report → on confirm: drop all target `content_*` tables, wipe the content/design tables listed above, restore schemas (fenced DDL path used by create_collection — mind the 100-table cap), rows, settings, and upload R2 assets; leave auth/API-key/deploy tables untouched. Re-render/live check after.

## Existing seams to reuse (mine these first)
- `CMS/src/lib/components/portable.ts` + the kit-install trust boundary (archived goal `goals/archive/component-kits/` — export-by-tag `*.kit.json` bundles with `format:"bizbeecms.kit"` envelope). The site export is conceptually a much bigger kit: same envelope discipline, versioned format id (e.g. `bizbeecms.site`).
- `goals/archive/content-collections/` — fenced runtime DDL machinery for content_* tables.
- Db/Storage ports (`goals/archive/binding-adapters/`) — export/import must go through the ports so it works on both local dev and deployed Workers (D1 + R2).
- Asset serving/upload paths: `asset-store.ts`, `/api/assets`.

## Constraints
- Must run ON Cloudflare Workers (no filesystem, request-size limits ~100MB): the artifact format must be streamable/chunkable — e.g. a JSON manifest + assets fetched individually, or a zip built with a pure-JS lib (fflate) if size-safe. If one blob is impractical for big galleries, a `site.json` + per-asset download/upload protocol behind one export/import UI is acceptable — the USER experience must still be "one export, one import".
- Operator-only endpoints (same guard as other admin REST); import additionally needs an explicit typed confirmation in the UI (it destroys the target's content).
- Works between: local dev (:3602) ↔ deployed per-Site Workers. E2E proof: export local-site, import into the deployed test instance (bizbeecms-cms-test-1) or a second scratch local DB.

## Environment facts (same as tableonline-home — see that goal's CAVEATS for hard-won MCP/publish traps)
- Local site: `npm run dev` in CMS/ on :3602; MCP over HTTP at http://localhost:3602/mcp (bearer in repo-root .mcp.json, key `local-site`). Never `opennextjs-cloudflare build` while dev runs.
- This goal is mostly REPO CODE work (CMS/ src + tests + commits), unlike tableonline-home which was mostly MCP content work.

## What "good" looks like
An operator clicks Export in the CMS admin and gets an artifact; on another instance clicks Import, uploads it, sees a dry-run report (what will be replaced, which data-source secrets need re-entry), types the confirmation, and after it completes the target site renders the source site's pages/theme/content identically (minus secrets, which are flagged). Round-trip covered by tests on the pure logic (manifest build/validate, table serialization, reset planning) per the repo's test discipline.
