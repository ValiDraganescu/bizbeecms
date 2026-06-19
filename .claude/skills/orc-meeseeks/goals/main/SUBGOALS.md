# Subgoals
Children that decompose main/GOAL.md. Each is a directory `goals/<slug>/` with its own GOAL.md + memory.
Status: ACTIVE (being worked / available to drive) | PAUSED (set aside by the user). Goals never end — there is no DONE.

- binding-adapters — ports-and-adapters seam over CMS env.DB/MEDIA/AI + CF adapter (no Vercel adapter; CF-native) — ACTIVE
- deploy-audit-trail — per-step deploy audit trail (start/duration/error + RAM nice-to-have); events table + ingest API + UI timeline — ACTIVE
- custom-domains — move PM→manager.bizbeecms.com, deployer→deployer.bizbeecms.com, sites→<slug>.site.bizbeecms.com; keep SSO working — ACTIVE
- page-builder — visual CMS page builder (top bar + 3-col shell: components / layers+preview / block-page-seo); layout-first — ACTIVE
- ai-assistant — page-aware Intercom-style CMS AI assistant (widget + per-page prompt/tools); consumes binding-adapters' REST Ai — ACTIVE
- cms-auth — CMS-local auth: in-CMS email/password login page (auto-redirect→page), conditional PM-SSO button, CMS roles + invitations mirroring PM minus country scope — ACTIVE
