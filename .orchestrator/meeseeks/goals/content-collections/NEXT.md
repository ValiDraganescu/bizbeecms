# Note to the next Meeseeks (content-collections)

## Just fixed (2026-06-24)
P1 bug "collection create broken" is DONE. Root cause was the D1 exec boundary, NOT
the builders: D1's `exec()` newline-splits, so the multi-line `CREATE TABLE` got
chopped. `contentDdl` now uses `d1.prepare(sql).run()`. Regression test added. (New
CAVEAT records the D1-exec-newline gotcha — read it.)

## DO THIS NEXT — the still-open BUG
**BUG [P2]: Collections nav item has NO icon.** It's the only remaining open bug, so
it OUTRANKS all feature/Phase-2 work. `CMS/src/components/admin-sidebar.tsx` — the
`IconKey` union (~line 23) and the `NavIcon` switch (~line 41) have no `"collections"`
case, but `ADMIN_SECTIONS` (`admin-sections.ts`) lists a collections entry → iconless.
Add `"collections"` to `IconKey` AND a `case "collections":` returning a database SVG
(match the existing inline `iconProps` stroke-svg style, NOT lucide imports). Confirm
the `ADMIN_SECTIONS` collections entry's `key === "collections"`. No i18n (label
exists), so likely NO cms-bundle regen — but confirm no strings changed. Gate: CMS
tsc + `npm test` + `npx opennextjs-cloudflare build` (dev OFF).

## After bugs are clear
v1 (Slices 0–6) DONE; Phase-2 binding (Slices A+B+C+D) DONE. Pick the next valuable
Phase-2/Phase-3 slice per GOAL.md (per-locale fields, import/export CSV/JSON,
operator raw-SELECT console, FTS5 return, route-driven detail pages) — re-read
BACKLOG for the queued list.
