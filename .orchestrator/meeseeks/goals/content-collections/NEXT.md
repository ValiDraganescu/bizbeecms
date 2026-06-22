# Note to the next Meeseeks (content-collections)

Slice 0 (the safety fence) is DONE. The keystone exists:
- `CMS/src/lib/content/fence.ts` — pure validators (`isContentName`, `isBuiltinName`,
  `validateStatement(sql, "read"|"write")`, `assertStatement`). USE these. Don't
  re-invent SQL validation — route ALL runtime SQL through them.
- `CMS/src/lib/content/content-db.ts` — `contentSelect`/`contentWrite`/`contentDdl`,
  the ONLY place runtime SQL hits D1. Each fences before any D1 call. They accept an
  injectable `D1Like` (4th/3rd arg) so you can node-test against a fake D1.
- Tests: `scripts/content-fence.test.mjs` (14, attack corpus). Gate cmd:
  `node --test scripts/content-fence.test.mjs`.

PICK NEXT: **Slice 1 — `collection` registry + field-schema → DDL generator.**
- Add a built-in `collection` table to `CMS/src/db/schema.ts` (Drizzle) + a migration
  in `CMS/migrations/` (deployer applies per-Site via `wrangler d1 migrations apply`).
  Columns: id, name, tableName (`content_<slug>`), schema JSON (fields: name, type,
  required, default, …), timestamps. (`collection` is ALREADY on the fence denylist.)
- PURE `buildCreateTableSql(schema)` — maps the propsSchema field-type vocab
  (string/text/richtext/number/int/bool/date/datetime/select/multiselect) → SQLite
  affinity (TEXT/INTEGER/REAL) + constraints. ALSO emit the system columns the binding
  phase needs: id, slug, status, archived_at, timestamps (decide+document in Slice 3,
  but reserve the names now). Generated DDL MUST pass `validateStatement(sql,"write")`
  AND `isContentName(tableName)` — assert that in tests. Column count ≤ D1's 100 limit.
- NO execution yet — pure generation + validation. Slice 2 wires it to `contentDdl`.

KEY DECISIONS (settled 2026-06-22 — don't relitigate): one real table per collection;
runtime DDL fenced to content_* + system-generated only; 100-table cap; registry table
is canonical; ADD-ONLY schema evolution in v1; AI gets STRUCTURED tools only (no raw
SQL); NO FTS5 in v1 (text search = LIKE); refs/page-binding = Phase 2.

GATE every slice: `node --test scripts/...` + `npx tsc --noEmit` +
`npx opennextjs-cloudflare build` (dev server MUST be down first — it corrupts .next).
Regen PM `cms-bundle` + EN/FI/ET only when you add user-facing strings (Slice 0/1 add none).
