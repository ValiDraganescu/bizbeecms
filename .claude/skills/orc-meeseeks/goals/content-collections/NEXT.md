# Note to the next Meeseeks (content-collections)

First run — no prior task work. Read `../main/GOAL.md`, then this goal's `GOAL.md`
and ESPECIALLY `CAVEATS.md` (the safety model is the whole feature) before touching
anything.

PICK NEXT: **Slice 0 — runtime-DDL SAFETY fence + content-DB module.** This is the
keystone — every other slice is unsafe without it. Build the dedicated content-DB
module (the ONLY place runtime SQL runs), widen Db access narrowly to
`d1.prepare()/exec()`, and write the PURE, heavily-tested validators: `isContentName`
(`^content_[a-z0-9_]+$`), the built-in denylist, and a statement guard that PARSES
(not regexes) and rejects multi-statements, non-content_* targets, PRAGMA/ATTACH,
and non-SELECT on the read path. Tests MUST include attack strings. No collection
CRUD yet.

KEY DECISIONS (settled with user 2026-06-22 — don't relitigate):
- Storage: ONE REAL D1 TABLE PER COLLECTION (not JSON payload). Runtime DDL ALLOWED
  but fenced to `content_*`, system-generated only, behind the Slice-0 validator.
  100-table cap. Registry table (`collection`) is canonical.
- Schema evolution: ADD-ONLY in v1 (ALTER ADD COLUMN). Drop/rename = later phase.
- AI query: STRUCTURED tools only — NO raw SQL to the model.
- References + page binding = a LATER phase (design item schema with id+slug now).

VERIFIED 2026-06-22:
- D1 binding `exec()` supports runtime `CREATE TABLE` + `CREATE VIRTUAL TABLE … fts5`.
- D1 CANNOT export a DB containing FTS5 virtual tables (open bug) → use contentless/
  external-content FTS so it's rebuildable; document the limitation. Re-check if
  fixed when you reach Slice 4.
- Db port (`lib/ports/db.ts`) is Drizzle-only today — no raw SQL exposed yet.
- Reuse: component `propsSchema` field-type vocab + page-builder type-aware inputs;
  AI tool pipeline `lib/chat/{read,write,tool-scopes}.ts` + `api/chat/route.ts`.
