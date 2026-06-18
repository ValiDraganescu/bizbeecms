/**
 * H1/H2 regression: portable component export/import.
 *
 *   1. The `components` i18n namespace must exist with IDENTICAL keys in all
 *      three admin-UI catalogs (EN/FI/ET) — a missing key throws at render.
 *   2. serialize → parse round-trips a valid component (the H1↔H2 contract).
 *   3. parsePortableComponent is the IMPORT trust boundary: it rejects a bad
 *      envelope/version, a non-renderable tree, and disallowed utility classes,
 *      and accepts a clean bundle (object or JSON string).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
  parsePortableComponent,
  serializeComponent,
} from "../src/lib/components/portable.ts";

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

test("components namespace exists with identical keys in EN/FI/ET", () => {
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  for (const [l, cat] of Object.entries(cats)) {
    assert.ok(cat.components, `${l}.json missing components namespace`);
  }
  const en = keys(cats.en.components).sort();
  assert.ok(en.length > 0, "EN components has keys");
  for (const l of ["fi", "et"]) {
    const got = keys(cats[l].components).sort();
    assert.deepEqual(got, en, `${l}.json components keys differ from EN`);
    for (const path of got) {
      const leaf = path.split(".").reduce((o, k) => o[k], cats[l].components);
      assert.ok(typeof leaf === "string" && leaf.trim() !== "", `${l}.components.${path} empty`);
    }
  }
});

// A valid stored row (tree is a JSON STRING in D1).
const goodRow = {
  name: "PricingCard",
  tree: JSON.stringify({ tag: "div", props: { className: "p-4" }, children: ["Hi"] }),
  script: "console.log('ok')",
  css: "p-4",
  propsSchema: '{"title":"string"}',
};

test("serialize → parse round-trips a valid component", () => {
  const bundle = serializeComponent(goodRow, { exportedAt: "2026-06-18T00:00:00Z" });
  assert.equal(bundle.format, PORTABLE_FORMAT);
  assert.equal(bundle.version, PORTABLE_VERSION);
  assert.deepEqual(bundle.component.tree, { tag: "div", props: { className: "p-4" }, children: ["Hi"] });

  const parsed = parsePortableComponent(bundle);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.errors.join("; "));
  assert.equal(parsed.component.name, "PricingCard");
  assert.equal(parsed.component.propsSchema, '{"title":"string"}');
});

test("parse accepts a JSON string of a bundle (paste/upload)", () => {
  const text = JSON.stringify(serializeComponent(goodRow));
  const parsed = parsePortableComponent(text);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.errors.join("; "));
});

test("parse rejects bad JSON, wrong format, wrong version", () => {
  assert.equal(parsePortableComponent("{not json").ok, false);
  assert.equal(parsePortableComponent({ format: "x", version: 1, component: {} }).ok, false);
  assert.equal(
    parsePortableComponent({ format: PORTABLE_FORMAT, version: 99, component: {} }).ok,
    false,
  );
});

test("parse rejects a disallowed utility class (trust boundary)", () => {
  const bundle = serializeComponent({
    ...goodRow,
    tree: JSON.stringify({ tag: "div", props: { className: "bg-blue-500" }, children: [] }),
    css: "",
  });
  const parsed = parsePortableComponent(bundle);
  assert.equal(parsed.ok, false);
});

test("parse rejects an unsafe component name", () => {
  const bundle = serializeComponent({ ...goodRow, name: "../../etc" });
  assert.equal(parsePortableComponent(bundle).ok, false);
});

test("parse rejects propsSchema that is not valid JSON", () => {
  const bundle = serializeComponent({ ...goodRow, propsSchema: "{not json" });
  assert.equal(parsePortableComponent(bundle).ok, false);
});
