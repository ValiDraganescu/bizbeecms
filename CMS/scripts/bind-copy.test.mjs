/**
 * Regression for the P2 stale-copy bug (2026-07-02): the single-item bind
 * panel said "Bind to collection" / "Fill this block's props from the first
 * matching collection item" even though the DATA SOURCE picker also offers
 * API sources (bind.groupApis). Copy must be source-agnostic.
 *
 * Also key-locks the pageBuilder.bind + pageBuilder.list namespaces EN/FI/ET.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const msgDir = join(here, "..", "messages");
const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), "utf8"));

function keys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...keys(v, path));
    else out.push(path);
  }
  return out;
}

// The exact pre-fix strings; their reappearance = the bug is back.
const STALE = {
  en: [
    "Bind to collection",
    "Fill this block's props from the first matching collection item.",
    "Repeat a component once per matching collection item.",
    "List (from collection)",
  ],
  fi: [
    "Sido kokoelmaan",
    "Täytä tämän lohkon ominaisuudet ensimmäisestä osuvasta kokoelman kohteesta.",
    "Toista komponentti kerran jokaiselle osuvalle kokoelman kohteelle.",
    "Lista (kokoelmasta)",
  ],
  et: [
    "Seo kogumikuga",
    "Täida selle ploki atribuudid esimese sobiva kogumiku üksuse põhjal.",
    "Korda komponenti iga sobiva kogumiku üksuse jaoks.",
    "Loend (kogumikust)",
  ],
};

test("bind/list panel copy is source-agnostic (no stale collection-only strings)", () => {
  for (const l of ["en", "fi", "et"]) {
    const pb = load(l).pageBuilder;
    // The picker offers API sources — the copy above it must not claim collections-only.
    assert.ok(pb.bind.groupApis, `${l}: picker offers API sources`);
    const rendered = [pb.bind.title, pb.bind.help, pb.list.title, pb.list.help, pb.layoutList];
    for (const stale of STALE[l]) {
      assert.ok(!rendered.includes(stale), `${l}: stale collection-only copy: "${stale}"`);
    }
  }
});

test("pageBuilder.bind + pageBuilder.list keys identical in EN/FI/ET, no blanks", () => {
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  for (const ns of ["bind", "list"]) {
    const en = keys(cats.en.pageBuilder[ns]).sort();
    assert.ok(en.length > 0, `EN pageBuilder.${ns} has keys`);
    for (const l of ["fi", "et"]) {
      assert.deepEqual(
        keys(cats[l].pageBuilder[ns]).sort(),
        en,
        `${l}.json pageBuilder.${ns} keys differ from en.json`,
      );
    }
    for (const [l, cat] of Object.entries(cats)) {
      for (const path of keys(cat.pageBuilder[ns])) {
        const v = path.split(".").reduce((o, k) => o[k], cat.pageBuilder[ns]);
        assert.ok(typeof v === "string" && v.trim() !== "", `${l}: pageBuilder.${ns}.${path} empty`);
      }
    }
  }
});
