/**
 * G5 regression: the pricing / e-commerce starter kit.
 *
 *   1. Every shipped kit bundle is in the v1 portable format AND passes the
 *      SAME import trust boundary (`parsePortableComponent`) a manual import
 *      hits — so installing the kit can never persist a bundle the gate rejects.
 *   2. Component names are unique within the kit (a dup would silently upsert
 *      over a sibling).
 *   3. Every prop's propsSchema parses to the richer field vocab, with the
 *      prose/identifier (price/URL) translatable split honored.
 *   4. The kit's i18n keys exist with IDENTICAL keys in EN/FI/ET.
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
} from "../src/lib/components/portable.ts";
import { pricingKit, pricingKitNames } from "../src/lib/components/pricing-kit.ts";
import { parsePropsSchema } from "../src/lib/pages/page-blocks.ts";

const here = dirname(fileURLToPath(import.meta.url));
const msgDir = join(here, "..", "messages");
const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), "utf8"));

test("kit is non-empty and every bundle has the v1 envelope", () => {
  const kit = pricingKit();
  assert.ok(kit.length >= 3, "kit should ship at least 3 components");
  for (const b of kit) {
    assert.equal(b.format, PORTABLE_FORMAT, `${b.component?.name}: wrong format`);
    assert.equal(b.version, PORTABLE_VERSION, `${b.component?.name}: wrong version`);
  }
});

test("every kit bundle passes the import gate (parsePortableComponent)", () => {
  for (const b of pricingKit()) {
    const parsed = parsePortableComponent(b);
    assert.ok(
      parsed.ok,
      `bundle "${b.component.name}" rejected: ${parsed.ok ? "" : parsed.errors.join("; ")}`,
    );
    assert.equal(parsed.component.name, b.component.name);
  }
});

test("kit bundles also pass when serialized as a JSON string (paste/file path)", () => {
  for (const b of pricingKit()) {
    const parsed = parsePortableComponent(JSON.stringify(b));
    assert.ok(parsed.ok, `string bundle "${b.component.name}" rejected`);
  }
});

test("component names are unique within the kit", () => {
  const names = pricingKitNames();
  assert.equal(new Set(names).size, names.length, "duplicate component name in kit");
  assert.ok(names.includes("PricingTier"));
  assert.ok(names.includes("ProductCard"));
});

test("every prop's propsSchema parses to the richer field vocab", () => {
  const KNOWN = new Set(["string", "richtext", "number", "boolean", "select", "date", "time"]);
  const byName = Object.fromEntries(pricingKit().map((b) => [b.component.name, b.component]));

  for (const b of pricingKit()) {
    const fields = parsePropsSchema(b.component.propsSchema);
    assert.ok(fields.length > 0, `${b.component.name}: no props parsed`);
    for (const f of fields) {
      assert.ok(KNOWN.has(f.type), `${b.component.name}.${f.name}: unknown field type ${f.type}`);
    }
  }

  const field = (comp, name) =>
    parsePropsSchema(byName[comp].propsSchema).find((f) => f.name === name);

  // PricingTier: name is prose → translatable; price is money + href is a URL → not.
  assert.equal(field("PricingTier", "name").translatable, true, "PricingTier.name should be translatable");
  assert.equal(field("PricingTier", "price").translatable, false, "PricingTier.price must not be translatable");
  assert.equal(field("PricingTier", "ctaHref").translatable, false, "PricingTier.ctaHref must not be translatable");

  // ProductCard: blurb is prose → translatable; price/imageUrl/buyHref are not.
  assert.equal(field("ProductCard", "blurb").translatable, true, "ProductCard.blurb should be translatable");
  assert.equal(field("ProductCard", "price").translatable, false, "ProductCard.price must not be translatable");
  assert.equal(field("ProductCard", "imageUrl").translatable, false, "ProductCard.imageUrl must not be translatable");
});

test("kit i18n keys exist with identical keys in EN/FI/ET", () => {
  const want = ["kitsTitle", "kitsHint", "installPricingKit"];
  for (const l of ["en", "fi", "et"]) {
    const c = load(l).components;
    assert.ok(c, `${l}.json missing components namespace`);
    for (const k of want) {
      assert.ok(typeof c[k] === "string" && c[k].length > 0, `${l}.json missing components.${k}`);
    }
  }
});
