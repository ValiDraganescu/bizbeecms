# Subgoals
Children that decompose main/GOAL.md. Each is a directory `goals/<slug>/` with its own GOAL.md + memory.
Status: ACTIVE (being worked / available to drive) | PAUSED (set aside by the user) | ARCHIVED (work folded into main, files moved to goals/archive/<slug>/). Goals never end — there is no DONE; ARCHIVED means "delivered, parked for reference".

## Active
- cms-auth — CMS-local auth: in-CMS login page (email/password + Google OAuth + PM-SSO), CMS roles + invitations (Cloudflare Email) mirroring PM's role set; PM user w/ CMS-site access = CMS Admin — ACTIVE
- pm-roles — PM user-management overhaul: 4-role hierarchy (SuperAdmin/Admin/Manager/Editor) w/ removal rules, Manager country+tag scope, global user-management UI+API — ACTIVE
- ai-openrouter — migrate CMS AI assistant off Cloudflare Workers AI onto OpenRouter behind the existing `Ai` port (swappable adapter); builds on archived ai-assistant + binding-adapters — ACTIVE
- component-kits — CMS custom-component tagging + export-by-tag as a one-file kit bundle (reuses the existing portable/kit-install machinery) — ACTIVE
- content-collections — user/AI-defined data collections: ONE real D1 table per collection via FENCED runtime DDL (content_* namespace, 100-table cap, system-generated), typed schema, structured SQL query, rich UI + structured AI tools; Phase 2 (greenlit) = component↔collection BINDING via a Section-style built-in `List` block + single-item first-match binding; FTS5 deferred — ACTIVE
- cms-mcp — expose the CMS AI tools over a REMOTE MCP server on each per-Site CMS Worker (`/mcp`), per-site API-key auth minted in the CMS admin UI, so local Claude Code can manage a site (brings its own model = cheaper); reuses the existing tool handlers via a shared dispatch — ACTIVE
- cms-releases — CMS release system: repo `release` skill (draft notes from commits → edit → semver tag `cms-v*`), deployer tag-list + release-notes endpoints, PM version PICKER (tagged releases only) + notes viewer on deploy, and deployed CMS version shown in site list + detail — ACTIVE
- external-data-sources — define external APIs (e.g. weather) as bindable DATA SOURCES w/ configurable auth (header/query/basic/none) + write-only encrypted secret; server-side cached fetch at render; binding seam generalized to collection|api; UI + AI tools (sample+map) — ACTIVE
- auth-reset — self-serve "forgot password" reset for BOTH PM and CMS users: token+email+set-new-password mirroring the invite flow; enumeration-safe; reset always sets a password (Google-SSO accounts too); reuses lib/auth/password.ts (PBKDF2) + live Cloudflare Email Sending — ACTIVE

## Archived (delivered; moved to goals/archive/<slug>/ — 2026-06-21)
- binding-adapters → `archive/binding-adapters/` — ports-and-adapters seam over CMS env.DB/MEDIA/AI + CF adapter (CF-native, no Vercel adapter). Db/Storage/Ai interfaces + CF adapters + mocked-port test shipped; the AI-over-REST path was delivered by ai-assistant.
- deploy-audit-trail → `archive/deploy-audit-trail/` — per-step deploy audit trail (events table + ingest API + localized timeline UI w/ per-step start/duration/error + run totals). Live end-to-end deploy spot-check is the only non-codeable check left.
- custom-domains → `archive/custom-domains/` — custom-domain SSO allowlist + always-visible DNS setup guide; `*.site.bizbeecms.com` scheme dropped (USER DECISION 2026-06-19) — sites stay permanently on `bizbeecms-cms-<slug>.workers.dev`.
- page-builder → `archive/page-builder/` — visual CMS page builder shipped: top bar + 3-col shell, layers/preview, block/page/SEO tabs, responsive columns, per-locale SEO + OG image, versioning (draft/publish/history/restore), AI-translate.
- ai-assistant → `archive/ai-assistant/` — page-aware Intercom-style CMS AI widget: per-page prompt + scoped tools, read/write tools, debug view, searchable model picker over the full Workers-AI catalog, per-Site history, multi-turn tool loop.
