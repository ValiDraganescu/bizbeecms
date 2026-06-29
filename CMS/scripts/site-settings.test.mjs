/**
 * E2 regression: per-Site brand/design/AI-persona settings.
 *
 *   1. The `brand` i18n namespace must exist with IDENTICAL non-empty keys in
 *      all three admin-UI catalogs (EN/FI/ET) — a missing key throws at render.
 *   2. `normalizeSiteIdentity` trims, length-bounds, drops non-strings/extras,
 *      and never throws (garbage → empty identity).
 *   3. `buildSystemPrompt` always ships the base instruction + tool guidance,
 *      and folds in the identity / component names / utility classes when given.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SITE_IDENTITY_FIELDS,
  emptySiteIdentity,
  isEmptyIdentity,
  normalizeSiteIdentity,
  buildSystemPrompt,
} from "../src/lib/settings/site-settings.ts";

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

test("brand namespace exists with identical non-empty keys in EN/FI/ET", () => {
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  for (const [l, cat] of Object.entries(cats)) {
    assert.ok(cat.brand, `${l}.json missing brand namespace`);
  }
  const en = keys(cats.en.brand).sort();
  assert.ok(en.length > 0, "EN brand has keys");
  for (const l of ["fi", "et"]) {
    assert.deepEqual(
      keys(cats[l].brand).sort(),
      en,
      `${l}.json brand keys differ from en.json`,
    );
  }
  for (const [l, cat] of Object.entries(cats)) {
    for (const path of keys(cat.brand)) {
      const v = path.split(".").reduce((o, k) => o[k], cat.brand);
      assert.ok(typeof v === "string" && v.trim() !== "", `${l}: ${path} empty`);
    }
  }
});

test("brand namespace has a label/placeholder/hint for every identity field", () => {
  const en = load("en").brand;
  for (const f of SITE_IDENTITY_FIELDS) {
    assert.ok(en.label[f], `missing label.${f}`);
    assert.ok(en.placeholder[f], `missing placeholder.${f}`);
    assert.ok(en.hint[f], `missing hint.${f}`);
  }
});

test("normalizeSiteIdentity: trims, clamps, drops non-strings/extras", () => {
  const r = normalizeSiteIdentity({
    brandName: "  Acme  ",
    tagline: 123, // not a string → ""
    voice: "x".repeat(500), // clamped to 400
    bogus: "dropped",
  });
  assert.equal(r.brandName, "Acme");
  assert.equal(r.tagline, "");
  assert.equal(r.voice.length, 400);
  assert.equal(r.design, "");
  assert.equal(r.aiPersona, "");
  assert.ok(!("bogus" in r));
});

test("normalizeSiteIdentity: garbage → empty identity, never throws", () => {
  for (const junk of [null, undefined, 5, "str", [], [1, 2]]) {
    assert.deepEqual(normalizeSiteIdentity(junk), emptySiteIdentity());
  }
});

test("isEmptyIdentity: empty is empty, any field fills it", () => {
  assert.equal(isEmptyIdentity(emptySiteIdentity()), true);
  assert.equal(isEmptyIdentity({ ...emptySiteIdentity(), brandName: "X" }), false);
});

test("buildSystemPrompt: always ships base + tools, omits empty identity", () => {
  const p = buildSystemPrompt({});
  assert.match(p, /create_component/);
  assert.match(p, /create_page/);
  assert.match(p, /list_assets/);
  assert.match(p, /no components yet/);
  // No identity given → no identity block.
  assert.doesNotMatch(p, /Brand name:/);
});

test("buildSystemPrompt: folds in identity + components", () => {
  const p = buildSystemPrompt({
    identity: { ...emptySiteIdentity(), brandName: "Acme", voice: "warm" },
    componentNames: ["Hero", "PricingCard"],
  });
  assert.match(p, /Brand name: Acme/);
  assert.match(p, /Brand voice\/tone: warm/);
  assert.match(p, /Hero, PricingCard/);
  // Empty fields aren't emitted as blank lines.
  assert.doesNotMatch(p, /Tagline:/);
});

test("buildSystemPrompt: tells the model full Tailwind compiles per page (variants + arbitrary values), prefer purpose tokens", () => {
  const p = buildSystemPrompt({});
  assert.match(p, /any standard Tailwind utility/);
  assert.match(p, /compiled per page at render time/);
  assert.match(p, /arbitrary values/);
  assert.match(p, /bg-primary/); // still steers toward purpose color tokens
});

test("buildSystemPrompt: lists content collections with exact table names + fields", () => {
  const p = buildSystemPrompt({
    collections: [{ tableName: "content_restaurants", fields: ["name", "price"] }],
  });
  assert.match(p, /content_restaurants \(name, price\)/);
  assert.match(p, /EXACT table name/);
});

test("buildSystemPrompt: always instructs to follow user guidance closely", () => {
  assert.match(buildSystemPrompt({}), /closely as possible/i);
});

test("buildSystemPrompt: folds in component DEFINITIONS (name + props) with required flag", () => {
  const p = buildSystemPrompt({
    components: [
      { name: "Hero", props: [
        { name: "title", type: "string", required: true, description: "Big heading" },
        { name: "subtitle", type: "string" },
      ] },
      { name: "Spacer", props: [] },
    ],
  });
  assert.match(p, /Hero \{ title: string! — Big heading; subtitle: string \}/);
  assert.match(p, /Spacer \(no props\)/);
  // Tells the model not to call get_component just for props.
  assert.match(p, /do NOT call get_component/);
});

test("buildSystemPrompt: definitions win over the legacy bare-name list", () => {
  const p = buildSystemPrompt({
    components: [{ name: "Hero", props: [] }],
    componentNames: ["IgnoredName"],
  });
  assert.match(p, /Hero \(no props\)/);
  assert.doesNotMatch(p, /IgnoredName/);
});

test("buildSystemPrompt: folds in built-in block types", () => {
  const p = buildSystemPrompt({
    builtins: [{ name: "Section", description: "A layout container." }],
  });
  assert.match(p, /Built-in block types/);
  assert.match(p, /Section: A layout container\./);
});
