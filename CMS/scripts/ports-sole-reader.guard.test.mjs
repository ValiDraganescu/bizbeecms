/**
 * GREP-GUARD: freezes the sole-reader invariant of the binding-adapters seam.
 *
 * The prior 6 workers built a ports-and-adapters seam (CMS/src/lib/ports/*) so
 * the ONLY code that reads the Cloudflare `env.DB` / `env.MEDIA` / `env.AI`
 * BINDINGS is the port factory. Everything else takes a `Db` / `Storage` / `Ai`
 * port and never touches the raw binding. This test scans CMS/src and FAILS if
 * any real read of those three bindings appears OUTSIDE the allowlisted port
 * files — so future code that bypasses the ports breaks CI instead of silently
 * eroding the seam.
 *
 * This is NOT a tautological mock test: it asserts a real, load-bearing
 * structural property of the actual source tree (the same property the whole
 * subgoal exists to establish). It currently PASSES because the invariant holds
 * (verified by worker #6); a stray `env.DB` read reintroduced anywhere outside
 * the ports would flip it red.
 *
 * Scope note (see goal CAVEATS): only the DB/MEDIA/AI *bindings* are in scope.
 * `env.PM_ORIGIN` / `env.CMS_AUTH_SECRET` / `env.SITE_ID` / `env.AI_GATEWAY`
 * are CONFIG VARS, not bindings — deliberately NOT matched here.
 *
 * SANCTIONED SECOND READER (content-collections Slice 0): the runtime-SQL fence
 * (`lib/content/content-db.ts`) is a DELIBERATE, narrow second `env.DB` reader —
 * the ONE controlled widening to `d1.prepare()/exec()` for `content_*` tables,
 * behind the statement fence (`lib/content/fence.ts`). The Drizzle `Db` port
 * exposes no raw SQL, so the content path can't go through it. This file is
 * allowlisted by exact path (not by directory) so the invariant stays sharp:
 * any OTHER stray binding read — including a second read inside content-db.ts —
 * still flips the guard red.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

// The ONLY files allowed to read env.DB / env.MEDIA / env.AI: the port factory.
const ALLOWLIST_DIR = path.join(SRC, "lib", "ports");

// Sanctioned second readers, allowlisted by EXACT path (not directory) so the
// invariant stays sharp. See the SANCTIONED SECOND READER note in the header:
// the runtime-SQL fence needs raw d1 access the Drizzle port can't give it.
const ALLOWLIST_FILES = new Set([path.join(SRC, "lib", "content", "content-db.ts")]);

/** True if `file` is allowed to read a binding (port factory or a sanctioned file). */
function isAllowlisted(file) {
  return file.startsWith(ALLOWLIST_DIR + path.sep) || ALLOWLIST_FILES.has(file);
}

// A real binding read: `env.DB` / `env.MEDIA` / `env.AI` as a property access,
// with a word boundary after so `env.AI_GATEWAY` (a config var) does NOT match.
const BINDING_READ = /\benv\.(DB|MEDIA|AI)\b/;

/** Strip // line comments and /* block comments *​/ so doc-comment mentions of
 *  `env.AI` (which litter the chat route's JSDoc) don't trip the guard. This is
 *  a lexer-lite stripper — good enough for our TS/TSX source (no regex literals
 *  contain these tokens, and template strings don't mention env.DB/MEDIA/AI). */
function stripComments(src) {
  let out = "";
  let i = 0;
  let state = "code"; // code | line | block | str | tmpl
  let quote = "";
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (state === "code") {
      if (c === "/" && next === "/") { state = "line"; i += 2; continue; }
      if (c === "/" && next === "*") { state = "block"; i += 2; continue; }
      if (c === '"' || c === "'") { state = "str"; quote = c; out += c; i++; continue; }
      if (c === "`") { state = "tmpl"; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out += c; }
      i++; continue;
    }
    if (state === "block") {
      if (c === "*" && next === "/") { state = "code"; i += 2; continue; }
      if (c === "\n") out += c; // keep line numbers roughly aligned
      i++; continue;
    }
    if (state === "str") {
      if (c === "\\") { out += c + (next ?? ""); i += 2; continue; }
      if (c === quote) state = "code";
      out += c; i++; continue;
    }
    if (state === "tmpl") {
      if (c === "\\") { out += c + (next ?? ""); i += 2; continue; }
      if (c === "`") state = "code";
      out += c; i++; continue;
    }
  }
  return out;
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|mts|cts|js|jsx|mjs)$/.test(e.name)) yield p;
  }
}

/** Files (outside the ports allowlist) that read a binding, in CODE (not comments). */
function findViolations() {
  const violations = [];
  for (const file of walk(SRC)) {
    if (isAllowlisted(file)) continue; // ports + sanctioned content-db fence
    const code = stripComments(readFileSync(file, "utf8"));
    code.split("\n").forEach((line, idx) => {
      const m = line.match(BINDING_READ);
      if (m) violations.push(`${path.relative(SRC, file)}:${idx + 1}  ${line.trim()}`);
    });
  }
  return violations;
}

test("no env.DB/MEDIA/AI binding read exists outside CMS/src/lib/ports", () => {
  const violations = findViolations();
  assert.deepEqual(
    violations,
    [],
    `Sole-reader invariant broken — these read a binding outside the ports seam:\n` +
      violations.join("\n") +
      `\n\nRoute binding access through getDb()/getStorage()/getAi() (or getPorts()) ` +
      `in CMS/src/lib/ports/ instead.`,
  );
});

test("the ports allowlist actually contains the binding reads (guard isn't vacuous)", () => {
  // Sanity: prove the guard's own machinery (stripComments + BINDING_READ) DOES
  // detect real reads — so a green result above means "none outside ports",
  // not "the matcher is broken". The ports dir must contain >=1 real read.
  let portReads = 0;
  for (const file of walk(ALLOWLIST_DIR)) {
    const code = stripComments(readFileSync(file, "utf8"));
    for (const line of code.split("\n")) if (BINDING_READ.test(line)) portReads++;
  }
  assert.ok(portReads >= 1, "expected the ports factory to contain real env.DB/MEDIA/AI reads");
});

test("the sanctioned content-db fence has exactly ONE binding read (exception stays narrow)", () => {
  // The content-db.ts allowlist entry is a DELIBERATE exception (the fenced
  // runtime-SQL site). Pin it to exactly ONE env.DB read so the exception can't
  // quietly grow into a general raw-binding escape hatch — a second read here
  // means someone widened the fence and must justify it.
  const fence = [...ALLOWLIST_FILES][0];
  const reads = stripComments(readFileSync(fence, "utf8"))
    .split("\n")
    .filter((line) => BINDING_READ.test(line));
  assert.equal(
    reads.length,
    1,
    `expected exactly 1 sanctioned binding read in ${path.relative(SRC, fence)}, found ${reads.length}:\n` +
      reads.join("\n"),
  );
});

test("stripComments removes doc-comment mentions but keeps real code reads", () => {
  // Direct unit of the one piece of non-trivial logic, so the guard can't pass
  // by accidentally treating a comment as code or vice-versa.
  assert.ok(!BINDING_READ.test(stripComments("// uses env.AI here")));
  assert.ok(!BINDING_READ.test(stripComments("/* env.DB and env.MEDIA */")));
  assert.ok(BINDING_READ.test(stripComments("const d = cfDb(env.DB);")));
  // Config vars must NOT match (word boundary after the binding name).
  assert.ok(!BINDING_READ.test(stripComments("const g = env.AI_GATEWAY;")));
  // A read with a trailing comment on the same line is still caught.
  assert.ok(BINDING_READ.test(stripComments("foo(env.MEDIA); // bucket")));
});
