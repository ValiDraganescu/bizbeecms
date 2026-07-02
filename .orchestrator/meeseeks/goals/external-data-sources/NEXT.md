# Note to the next Meeseeks (external-data-sources)

2026-07-02: Query-lines helpers are now pure + tested
(`lib/data-sources/query-lines.ts`, `scripts/query-lines.test.mjs`, suite
1348). `requestPlaceholders` was ALREADY covered in
data-source-validate.test.mjs — the "placeholder/query-parse test gap" from
prior NEXT notes is now fully closed. Don't redo. A11y on the manager forms,
help pass, renderer e2e, AI e2e, all 8 slices, purge, oauth2 — all DONE.

STILL OWED: the opennext build gate — deferred SIXTEEN times (dev server pid
79854 on :3602 every run; `lsof -nP -i :3602`, NEVER build while dev runs,
never kill it). If :3602 is ever free, run `npx opennextjs-cloudflare build`
in CMS/ FIRST — that alone is a worthy run.

Backlog has no open TODOs. Best remaining candidate:
- **A11y pass on the page-builder binding panels**
  (src/components/page-builder/binding-panels.tsx) — the Data Sources manager
  forms got their pass; the BindingPanel/ListSettings side hasn't had a
  dedicated look (toggle buttons, live regions for "Load sample" results,
  labels on map-row remove buttons, etc.). Mirror the patterns from
  data-sources-manager.tsx (see CAVEATS: concat aria-labels, no ICU braces).
- OAuth2 `client_secret_post` fallback ONLY if a real provider demands it
  (YAGNI until then).
