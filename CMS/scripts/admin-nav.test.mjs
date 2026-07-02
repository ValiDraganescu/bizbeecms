/**
 * Slice #6 regression: the shared /admin nav + index page i18n.
 *
 * The nav (layout chrome) and the /admin index page read the `adminNav`
 * namespace. A missing key throws at render, and the parity test is the
 * key-lock that keeps EN/FI/ET in sync. Also assert every nav section has a
 * label AND a description (the index page renders desc.<key> per section).
 *
 * Icon lock (bug 2026-07-02): SidebarShell casts ADMIN_SECTIONS keys to
 * IconKey, so tsc can NOT catch a section key without a NavIcon case — the
 * "Data sources" item rendered iconless. SECTIONS is now parsed from
 * admin-sections.ts (a hand-mirrored list here had drifted the same way),
 * and every section key must have a `case "<key>":` in NavIcon.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const msgDir = join(here, "..", "messages");
const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), "utf8"));
const src = (p) => readFileSync(join(here, "..", "src", p), "utf8");

function keys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...keys(v, path));
    else out.push(path);
  }
  return out;
}

// Top-level ADMIN_SECTIONS keys, parsed from the source so this list can't
// drift (children keys are sub-pages — no icons, no desc.<key> required).
const sectionsSrc = src("components/admin-sections.ts");
const SECTIONS = [
  ...sectionsSrc
    .replace(/children:\s*\[[^\]]*\]/g, "")
    .matchAll(/key:\s*"(\w+)"/g),
].map((m) => m[1]);

test("SECTIONS parsed from admin-sections.ts", () => {
  assert.ok(SECTIONS.length >= 5, `parsed too few sections: ${SECTIONS}`);
  assert.ok(SECTIONS.includes("dataSources"), "dataSources section present");
  assert.ok(!SECTIONS.includes("componentsDevelop"), "children keys excluded");
});

test("every sidebar section key has a NavIcon case (icon lock)", () => {
  const sidebar = src("components/admin-sidebar.tsx");
  for (const key of ["home", ...SECTIONS]) {
    assert.ok(
      sidebar.includes(`case "${key}":`),
      `NavIcon in admin-sidebar.tsx has no case for "${key}" — the nav item renders iconless`,
    );
    assert.ok(
      sidebar.includes(`| "${key}"`),
      `IconKey union in admin-sidebar.tsx missing "${key}"`,
    );
  }
});

test("adminNav namespace exists with identical keys in EN/FI/ET", () => {
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  for (const [l, cat] of Object.entries(cats)) {
    assert.ok(cat.adminNav, `${l}.json missing adminNav namespace`);
  }
  const en = keys(cats.en.adminNav).sort();
  assert.ok(en.length > 0, "EN adminNav has keys");
  for (const l of ["fi", "et"]) {
    assert.deepEqual(keys(cats[l].adminNav).sort(), en, `${l}.json adminNav keys differ from en.json`);
  }
  // No placeholder blanks.
  for (const [l, cat] of Object.entries(cats)) {
    for (const path of keys(cat.adminNav)) {
      const v = path.split(".").reduce((o, k) => o[k], cat.adminNav);
      assert.ok(typeof v === "string" && v.trim() !== "", `${l}: adminNav.${path} empty`);
    }
  }
});

test("every nav section has a label and a description in all locales", () => {
  for (const l of ["en", "fi", "et"]) {
    const nav = load(l).adminNav;
    assert.ok(nav.brand && nav.home && nav.indexTitle && nav.indexSubtitle, `${l}: chrome keys present`);
    for (const s of SECTIONS) {
      assert.ok(typeof nav[s] === "string" && nav[s].trim(), `${l}: missing label adminNav.${s}`);
      assert.ok(typeof nav.desc?.[s] === "string" && nav.desc[s].trim(), `${l}: missing adminNav.desc.${s}`);
    }
  }
});
