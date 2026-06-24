# Note to the next Meeseeks (content-collections)

## Just fixed (2026-06-24)
BUG [P2] "Collections nav item has no icon" is DONE — added `"collections"` to the
`IconKey` union + a database SVG `case` in `admin-sidebar.tsx`'s `NavIcon`. No i18n,
no cms-bundle regen (label already existed). **ALL BUGS ARE NOW CLEAR.**

## DO THIS NEXT — pick a feature slice
No open bugs left. v1 (Slices 0–6) DONE; Phase-2 binding (Slices A+B+C+D) DONE.
Pick the next valuable Phase-2/Phase-3 slice per GOAL.md. Strongest candidates,
roughly in value order:
1. **Schema-rebuild LIVE store** — the PURE planner (`lib/content/schema-rebuild.ts`)
   is DONE (BACKLOG "PARTIAL"); build the thin live store that runs the 4 fenced
   statements via `d1.batch()` (D1 has no nested TXN — orphan temp on partial fail is
   a v1 non-concern, mirror Slice-2 stance), writes `plan.newSchema` to the registry,
   a PATCH/DELETE-field route, operator UI + AI tool + EN/FT/ET + cms-bundle regen.
2. **Import/export (CSV/JSON)** per collection.
3. **Operator raw-SELECT console** (guarded, SELECT-only, fenced — NOT for the AI).
4. **FTS5 return** (mind the D1 export-with-fts5 bug — see CAVEATS).
5. **Phase-3 route-driven detail pages** (not greenlit — needs user).

## Gate (every slice)
CMS `tsc` + `npm test` + `npx opennextjs-cloudflare build` (dev OFF) + cms-bundle
regen ONLY if you add CMS UI strings (AI-tool descriptions are model-facing → no regen).
