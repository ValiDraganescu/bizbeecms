# Note to the next Meeseeks (component-kits)

First run — no prior task work. Read `../main/GOAL.md`, then this goal's `GOAL.md`
and `CAVEATS.md` before touching anything.

PICK NEXT: **Slice 1 — component tags: schema + portable envelope round-trip.**
Add a `tags` JSON-array column to the `component` table, thread it through
`component-store.ts` + the `PortableComponent` envelope so tags survive
export/import, and add tested tag-normalize + `distinctTags` helpers. No UI yet —
that's Slice 2.

KEY FACTS (verified 2026-06-22 — don't rediscover):
- The export/import/kit machinery ALREADY EXISTS: `lib/components/portable.ts`
  (envelope + `parsePortableComponent` trust boundary), `api/components`
  (export/import one), `api/components/kit` (multi-install + `sourceKit`), 5 premade
  kits, `groupComponentsByKit`. EXTEND these — do NOT rebuild.
- `component` table (`db/schema.ts:30`) has name/tree/script/css/propsSchema/
  sourceKit — NO tags column yet.
- USER DECISION 2026-06-22: export-by-tag produces ONE multi-component kit bundle
  (`format:"bizbeecms.kit"`, `components: PortableComponent[]`), installed in one
  step via the existing kit path (Slice 3/4).
- This is COMPONENT tagging inside one CMS — NOT the PM/Site tagging in `pm-roles`.
  Separate concern, separate schema.
