/**
 * C1b regression: the content-locale settings UI.
 *
 * Two things this run added that can silently break:
 *   1. The `contentLocales` i18n namespace must exist with IDENTICAL keys in all
 *      three admin-UI catalogs (EN/FI/ET) — a missing key throws at render.
 *   2. The route/editor rely on `normalizeContentLocales` (pure, in localize.ts)
 *      for the add/default/remove invariants: default leads the set, no dupes,
 *      invalid codes dropped. Re-assert the invariants the UI depends on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeContentLocales } from "../src/lib/render/localize.ts";

const here = dirname(fileURLToPath(import.meta.url));
const msgDir = join(here, "..", "messages");
const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), "utf8"));

// Recursively collect dotted key paths of an object's leaves.
function keys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...keys(v, path));
    else out.push(path);
  }
  return out;
}

test("contentLocales namespace exists with identical keys in EN/FI/ET", () => {
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  for (const [l, cat] of Object.entries(cats)) {
    assert.ok(cat.contentLocales, `${l}.json missing contentLocales namespace`);
  }
  const en = keys(cats.en.contentLocales).sort();
  assert.ok(en.length > 0, "EN contentLocales has keys");
  for (const l of ["fi", "et"]) {
    assert.deepEqual(
      keys(cats[l].contentLocales).sort(),
      en,
      `${l}.json contentLocales keys differ from en.json`,
    );
  }
  // Every value non-empty (no placeholder blanks).
  for (const [l, cat] of Object.entries(cats)) {
    for (const path of keys(cat.contentLocales)) {
      const v = path
        .split(".")
        .reduce((o, k) => o[k], cat.contentLocales);
      assert.ok(typeof v === "string" && v.trim() !== "", `${l}: ${path} empty`);
    }
  }
});

test("normalizeContentLocales: UI invariants — default leads, no dupes, drops junk", () => {
  // Add a duplicate + an invalid code; default must lead the deduped set.
  const r = normalizeContentLocales({
    default: "fi",
    locales: ["en", "fi", "fi", "EN", "not-a-locale-code-123", "pt-br"],
  });
  assert.equal(r.default, "fi");
  assert.equal(r.locales[0], "fi", "default leads the set");
  assert.deepEqual(r.locales, ["fi", "en", "pt-br"]);
});

test("normalizeContentLocales: garbage → safe non-empty default", () => {
  const r = normalizeContentLocales({ locales: [] });
  assert.ok(r.locales.length >= 1, "never empties the set");
  assert.ok(r.locales.includes(r.default));
});
