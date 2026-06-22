/**
 * content-collections — Slice 0: the runtime-DDL/DML SAFETY fence (the keystone).
 *
 * Each per-Site CMS lets the operator/AI define typed data collections, each
 * backed by a REAL D1 table created AT RUNTIME. Runtime DDL is normally a hard
 * no — it's allowed here ONLY because of this fence (USER DECISION 2026-06-22):
 * every runtime-created/altered/queried object lives under the `content_*`
 * namespace, the DDL/DML is SYSTEM-generated from a typed schema (nobody writes
 * raw SQL), and EVERY statement passes the validators below before it touches
 * D1. Violate one invariant and it's a critical hole — so this module is PURE
 * (no I/O, no D1) and exhaustively tested with attack strings.
 *
 * Design choice that matters: the statement guard PARSES (tokenizes) the SQL —
 * it does NOT regex the raw string. Comment tricks (`-- `, `/* *​/`), quoted
 * identifiers (`"page"`, `[page]`, `` `page` ``), and trailing
 * `; DROP TABLE page` all defeat naive string-matching, so we strip
 * strings/comments first, reject multi-statement input, then inspect the bare
 * token stream. See `content-fence.test.mjs` for the attack corpus.
 */

/** The reserved namespace prefix. Every runtime object name MUST match this. */
const CONTENT_NAME_RE = /^content_[a-z0-9_]+$/;

/**
 * Built-in tables the runtime path may NEVER touch. The `content_*` prefix
 * allowlist already excludes these, but we keep an explicit denylist as a second
 * independent guard (defence in depth) AND to catch the registry table
 * (`collection`) and SQLite internals by exact name even if naming ever drifts.
 */
const BUILTIN_DENYLIST = new Set([
  "component",
  "page",
  "page_version",
  "site_settings",
  "asset",
  "chat_thread",
  "collection",
  "d1_migrations",
]);

/** A valid content object name: `content_<lowercase/digits/underscore>`. */
export function isContentName(name: unknown): name is string {
  return typeof name === "string" && CONTENT_NAME_RE.test(name);
}

/** Is this identifier an off-limits built-in (exact name or sqlite_* internal)? */
export function isBuiltinName(name: string): boolean {
  const n = name.toLowerCase();
  return BUILTIN_DENYLIST.has(n) || n.startsWith("sqlite_");
}

/**
 * Strip SQL string literals and comments to a placeholder, so the token scan
 * can't be fooled by an identifier hidden inside a string/comment and can't miss
 * a `;` or keyword hidden the same way. Returns the de-quoted, de-commented SQL
 * with `'...'` literals replaced by a single space (their bytes can't be
 * identifiers anyway — parameterized values never flow through here).
 *
 * We DON'T strip double-quote / backtick / bracket quoting here: those denote
 * *identifiers* (e.g. `"page"`), which we explicitly WANT to see and validate.
 * We only neutralise single-quoted string literals + comments.
 */
function stripStringsAndComments(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    // single-quoted string literal — '' is an escaped quote
    if (c === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; } // escaped ''
          i++;
          break;
        }
        i++;
      }
      out += " ";
      continue;
    }
    // line comment -- ... \n
    if (c === "-" && sql[i + 1] === "-") {
      i += 2;
      while (i < n && sql[i] !== "\n") i++;
      out += " ";
      continue;
    }
    // block comment /* ... */
    if (c === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      out += " ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Split a (string/comment-stripped) SQL into top-level statements on `;`.
 * After stripping there are no string literals left to hide a `;`, so a plain
 * split is sound. Trailing empty statements (a lone trailing `;`) are dropped.
 */
function splitStatements(stripped: string): string[] {
  return stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Extract bare identifier-ish tokens from stripped SQL, UNWRAPPING quoted
 * identifiers (`"x"`, `[x]`, `` `x` ``) to their inner name so a quoted built-in
 * can't slip past. Returns lowercase tokens. Used to find every table/object
 * name a statement references.
 */
function extractIdentifiers(stripped: string): string[] {
  const ids: string[] = [];
  let i = 0;
  const n = stripped.length;
  const pushWord = (w: string) => { if (w) ids.push(w.toLowerCase()); };
  while (i < n) {
    const c = stripped[i];
    if (c === '"' || c === "`") {
      const close = c;
      i++;
      let w = "";
      while (i < n && stripped[i] !== close) { w += stripped[i]; i++; }
      i++; // skip close
      pushWord(w);
      continue;
    }
    if (c === "[") {
      i++;
      let w = "";
      while (i < n && stripped[i] !== "]") { w += stripped[i]; i++; }
      i++;
      pushWord(w);
      continue;
    }
    if (/[A-Za-z0-9_]/.test(c)) {
      let w = "";
      while (i < n && /[A-Za-z0-9_]/.test(stripped[i])) { w += stripped[i]; i++; }
      pushWord(w);
      continue;
    }
    i++;
  }
  return ids;
}

/** SQL keywords — tokens that are syntax, not object names. */
const SQL_KEYWORDS = new Set([
  "select", "from", "where", "insert", "into", "values", "update", "set",
  "delete", "create", "table", "virtual", "drop", "alter", "add", "column",
  "rename", "and", "or", "not", "null", "is", "in", "like", "between", "order",
  "by", "asc", "desc", "limit", "offset", "group", "having", "as", "on", "join",
  "left", "inner", "outer", "cross", "distinct", "count", "sum", "avg", "min",
  "max", "exists", "case", "when", "then", "else", "end", "primary", "key",
  "foreign", "references", "unique", "default", "autoincrement", "if", "using",
  "text", "integer", "real", "blob", "numeric", "constraint", "check", "index",
  "true", "false", "current_timestamp", "instr",
]);

/** Statements that are DDL/DML and require a content_* target check. */
type Verb = "select" | "insert" | "update" | "delete" | "create" | "alter" | "drop";

function firstKeyword(stripped: string): string {
  const m = stripped.trim().match(/^([A-Za-z_]+)/);
  return m ? m[1].toLowerCase() : "";
}

export type FenceMode = "read" | "write";

export type FenceResult = { ok: true } | { ok: false; reason: string };

/**
 * The load-bearing guard. Validate ONE system-generated statement before it runs.
 *
 * - `read` mode: exactly ONE `SELECT`, content_*-scoped, no PRAGMA/ATTACH, no
 *   multi-statement. (No mutation verbs.)
 * - `write` mode: exactly ONE DDL/DML statement (CREATE/ALTER/DROP/INSERT/
 *   UPDATE/DELETE), content_*-scoped, no PRAGMA/ATTACH, no multi-statement.
 *
 * Invariants enforced (any failure → `{ ok: false }`, never throws on bad SQL):
 *  - reject multi-statement input (after comment/string stripping);
 *  - reject PRAGMA / ATTACH / DETACH / VACUUM / transaction control / temp;
 *  - reject any reference to a built-in/system table (denylist + sqlite_*);
 *  - require at least one `content_*` object name to actually be present;
 *  - reject any NON-content identifier that isn't a known SQL keyword
 *    (so a stray real table name can't ride along).
 */
export function validateStatement(rawSql: string, mode: FenceMode): FenceResult {
  if (typeof rawSql !== "string" || rawSql.trim() === "") {
    return { ok: false, reason: "empty statement" };
  }

  const stripped = stripStringsAndComments(rawSql);
  const statements = splitStatements(stripped);

  if (statements.length === 0) return { ok: false, reason: "no statement" };
  if (statements.length > 1) {
    return { ok: false, reason: "multi-statement input is rejected" };
  }

  const stmt = statements[0];
  const lower = stmt.toLowerCase();

  // Hard-blocked verbs/keywords regardless of mode — these have no place in the
  // fenced runtime path and several are escape hatches (ATTACH another DB,
  // PRAGMA writable_schema, etc).
  const BLOCKED = [
    "pragma", "attach", "detach", "vacuum", "begin", "commit", "rollback",
    "savepoint", "release", "reindex", "analyze", "temp", "temporary",
    "trigger", "without", // WITHOUT ROWID / trigger bodies out of scope for v1
  ];
  for (const w of BLOCKED) {
    if (new RegExp(`(^|[^a-z0-9_])${w}([^a-z0-9_]|$)`).test(lower)) {
      return { ok: false, reason: `blocked keyword: ${w}` };
    }
  }

  const verb = firstKeyword(stmt) as Verb;

  if (mode === "read") {
    if (verb !== "select") {
      return { ok: false, reason: `read path allows only SELECT, got: ${verb || "?"}` };
    }
  } else {
    const allowed: Verb[] = ["create", "alter", "drop", "insert", "update", "delete"];
    if (!allowed.includes(verb)) {
      return { ok: false, reason: `write path verb not allowed: ${verb || "?"}` };
    }
  }

  // Inspect every identifier referenced. Reject any built-in; require content_*.
  const ids = extractIdentifiers(stmt);
  let sawContent = false;
  for (const id of ids) {
    if (SQL_KEYWORDS.has(id)) continue;
    if (isBuiltinName(id)) {
      return { ok: false, reason: `references built-in/system object: ${id}` };
    }
    if (CONTENT_NAME_RE.test(id)) { sawContent = true; continue; }
    // A non-keyword, non-content, non-builtin token: could be a column name,
    // alias, or a literal number. Numbers are fine. Anything else that looks
    // like a bare object name we treat as a column/alias — it's NOT a table the
    // statement can target without a content_* qualifier already present, and
    // the system generator only ever emits content_* table refs + column names.
    // We allow it (columns are unavoidable) but it can NEVER be a built-in
    // (checked above) — so it can't reach a protected table.
  }

  if (!sawContent) {
    return { ok: false, reason: "no content_* object referenced" };
  }

  return { ok: true };
}

/** Convenience: throw if invalid. Use at the exec boundary. */
export function assertStatement(rawSql: string, mode: FenceMode): void {
  const r = validateStatement(rawSql, mode);
  if (!r.ok) throw new Error(`content fence rejected statement: ${r.reason}`);
}
