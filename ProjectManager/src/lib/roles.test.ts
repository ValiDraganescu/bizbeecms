import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * pm-roles Slice 1 regression: the role enum is SuperAdmin | Admin | Manager |
 * Editor (SiteManager removed → Editor), and every locale carries exactly one
 * label per role. Locks the rename so a future change can't silently resurrect
 * "SiteManager", change the role set, or drop a role label from a locale.
 *
 * NOTE: asserts against source TEXT (schema.ts) + the message JSONs rather than
 * importing the modules — the lib modules use the `@/` path alias which Node's
 * native TS stripping doesn't resolve, so they aren't importable from a bare
 * `node --test`. (Existing tests only import alias-free modules.)
 */

const ROLES = ["SuperAdmin", "Admin", "Manager", "Editor"] as const;
const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..");
const messagesDir = join(here, "..", "..", "messages");

test("schema Role union is the new 4-role set, no SiteManager", () => {
  const schema = readFileSync(join(srcDir, "db", "schema.ts"), "utf8");
  const m = schema.match(/export type Role =\s*([^;]+);/);
  assert.ok(m, "Role type declaration found");
  const decl = m![1];
  for (const r of ROLES) {
    assert.ok(decl.includes(`"${r}"`), `Role union includes ${r}`);
  }
  assert.ok(!decl.includes("SiteManager"), "Role union must not include SiteManager");
});

test("no source file references the old SiteManager role token", () => {
  // schema.ts keeps ONE historical mention in a comment ("renamed old
  // SiteManager") — exclude it; everything else must be clean.
  const files = [
    "lib/invite/authz.ts",
    "lib/site/authz.ts",
    "lib/site/site.ts",
    "components/nav/app-nav.tsx",
    "app/(app)/invite/invite-form.tsx",
  ];
  for (const f of files) {
    const text = readFileSync(join(srcDir, f), "utf8");
    assert.ok(
      !/SiteManager|siteManager/.test(text),
      `${f} must not reference SiteManager`,
    );
  }
});

test("every locale's roles block has exactly one key per Role, lowercase-first", () => {
  const expected = ROLES.map((r) => r.charAt(0).toLowerCase() + r.slice(1)).sort();
  for (const locale of ["en", "fi", "et"]) {
    const m = JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), "utf8"));
    assert.deepEqual(
      Object.keys(m.roles).sort(),
      expected,
      `${locale}.json roles keys must match the Role union`,
    );
    for (const key of expected) {
      assert.ok(m.roles[key]?.length, `${locale}.roles.${key} must be a non-empty label`);
    }
  }
});
