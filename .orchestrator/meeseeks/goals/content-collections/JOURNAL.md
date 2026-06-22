# Journal — content-collections
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-22 11:34 — Slice 0: runtime-DDL/DML SAFETY fence + content-DB module
- **Status:** DONE
- **What I did:** Built the keystone safety layer. Two new modules under
  `CMS/src/lib/content/`:
  - `fence.ts` — PURE validators (no I/O): `isContentName` (`^content_[a-z0-9_]+$`),
    `isBuiltinName` (denylist component/page/page_version/site_settings/asset/
    chat_thread/collection/d1_migrations + `sqlite_*`), and `validateStatement(sql,
    mode)` / `assertStatement`. The statement guard PARSES (tokenizes) not regexes:
    strips single-quote string literals + `--`/`/* */` comments, splits on `;` and
    REJECTS multi-statement, unwraps quoted/bracket/backtick identifiers so a quoted
    built-in (`"page"`, `[page]`, `` `page` ``) can't slip past, blocks PRAGMA/ATTACH/
    DETACH/VACUUM/BEGIN/COMMIT/TRIGGER/etc, enforces verb-per-mode (read=SELECT only,
    write=CREATE/ALTER/DROP/INSERT/UPDATE/DELETE), rejects any built-in ref, and
    REQUIRES at least one content_* target.
  - `content-db.ts` — the ONLY place runtime SQL touches D1: `contentSelect`
    (param SELECT, MAX_READ_ROWS=1000 backstop), `contentWrite` (param DML), `contentDdl`
    (system-gen DDL via `exec`). Each calls `assertStatement` BEFORE any D1 call.
    Takes an injectable `D1Like` for testing; resolves `env.DB` directly (the
    controlled narrow widening — Drizzle port stays Drizzle-only for built-ins).
  - NO collection CRUD, NO registry table yet — just the fence + its tests.
- **Verified:** `scripts/content-fence.test.mjs` — 14 tests incl. attack corpus
  (multi-statement `; DROP TABLE page`, quoted/bracket/backtick built-in refs,
  comment-hidden tricks, PRAGMA/ATTACH escapes, wrong-verb-for-mode, no-content-target)
  all PASS. `npx tsc --noEmit` green. `npx opennextjs-cloudflare build` green (exit 0,
  no errors; dev server confirmed down first). No new UI strings → no i18n/cms-bundle work.
- **Files:** CMS/src/lib/content/fence.ts, CMS/src/lib/content/content-db.ts,
  CMS/scripts/content-fence.test.mjs

## 2026-06-22 12:29 — BUG [P2]: ports-sole-reader.guard fails on content-db.ts
- **Status:** DONE
- **What I did:** Slice 0's `content-db.ts` legitimately reads `env.DB` (line 39,
  the fenced runtime-SQL widening), which tripped the binding-adapters sole-reader
  guard (it allowlisted only `lib/ports/`). Sanctioned content-db.ts WITHOUT
  blunting the invariant:
  - Added `ALLOWLIST_FILES` (a Set keyed by EXACT path, not a directory) +
    `isAllowlisted(file)` helper; the violation scan now skips ports OR a
    sanctioned exact-path file. Documented WHY in a new "SANCTIONED SECOND READER"
    header note.
  - Added a NEW assertion: the sanctioned fence file must contain EXACTLY ONE
    binding read — so the exception stays narrow (a 2nd read inside content-db.ts,
    or any other stray reader anywhere, still flips the guard red). The invariant
    stays load-bearing, not a blank check.
- **Verified:** `node --test scripts/ports-sole-reader.guard.test.mjs` → 4/4 pass.
  `npm test` (full CMS suite) → **505/505 green** (was 499/500). Test-only change
  (no TS source / runtime code touched) → no tsc/opennext build or i18n needed.
- **Files:** CMS/scripts/ports-sole-reader.guard.test.mjs
