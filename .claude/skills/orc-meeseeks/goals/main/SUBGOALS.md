# Subgoals
Children that decompose main/GOAL.md. Each is a directory `goals/<slug>/` with its own GOAL.md + memory.
Status: ACTIVE (being worked / available to drive) | PAUSED (set aside by the user) | ARCHIVED (work folded into main, files moved to goals/archive/<slug>/). Goals never end — there is no DONE; ARCHIVED means "delivered, parked for reference".

## Active
- cms-auth — CMS-local auth: in-CMS login page (email/password + Google OAuth + PM-SSO), CMS roles + invitations (Cloudflare Email) mirroring PM's role set; PM user w/ CMS-site access = CMS Admin — ACTIVE
- pm-roles — PM user-management overhaul: 4-role hierarchy (SuperAdmin/Admin/Manager/Editor) w/ removal rules, Manager country+tag scope, global user-management UI+API — ACTIVE
- ai-openrouter — migrate CMS AI assistant off Cloudflare Workers AI onto OpenRouter behind the existing `Ai` port (swappable adapter); builds on archived ai-assistant + binding-adapters — ACTIVE
- component-kits — CMS custom-component tagging + export-by-tag as a one-file kit bundle (reuses the existing portable/kit-install machinery) — ACTIVE
- content-collections — user/AI-defined data collections: ONE real D1 table per collection via FENCED runtime DDL (content_* namespace, 100-table cap, system-generated), typed schema, structured SQL query (FTS5 + page-binding deferred to Phase 2), rich UI + structured AI tools — ACTIVE

## Archived (delivered; moved to goals/archive/<slug>/ — 2026-06-21)
- binding-adapters → `archive/binding-adapters/` — ports-and-adapters seam over CMS env.DB/MEDIA/AI + CF adapter (CF-native, no Vercel adapter). Db/Storage/Ai interfaces + CF adapters + mocked-port test shipped; the AI-over-REST path was delivered by ai-assistant.
- deploy-audit-trail → `archive/deploy-audit-trail/` — per-step deploy audit trail (events table + ingest API + localized timeline UI w/ per-step start/duration/error + run totals). Live end-to-end deploy spot-check is the only non-codeable check left.
- custom-domains → `archive/custom-domains/` — custom-domain SSO allowlist + always-visible DNS setup guide; `*.site.bizbeecms.com` scheme dropped (USER DECISION 2026-06-19) — sites stay permanently on `bizbeecms-cms-<slug>.workers.dev`.
- page-builder → `archive/page-builder/` — visual CMS page builder shipped: top bar + 3-col shell, layers/preview, block/page/SEO tabs, responsive columns, per-locale SEO + OG image, versioning (draft/publish/history/restore), AI-translate.
- ai-assistant → `archive/ai-assistant/` — page-aware Intercom-style CMS AI widget: per-page prompt + scoped tools, read/write tools, debug view, searchable model picker over the full Workers-AI catalog, per-Site history, multi-turn tool loop.
