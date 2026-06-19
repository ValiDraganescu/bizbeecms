/**
 * G2 regression: the landing / marketing starter kit.
 *
 *   1. Every shipped kit bundle is in the v1 portable format AND passes the
 *      SAME import trust boundary (`parsePortableComponent`) a manual import
 *      hits — so installing the kit can never persist a bundle the gate rejects.
 *   2. Component names are unique within the kit (a dup would silently upsert
 *      over a sibling).
 *   3. The kit's i18n keys exist with IDENTICAL keys in EN/FI/ET.
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
import { landingKit, landingKitNames } from "../src/lib/components/landing-kit.ts";

const here = dirname(fileURLToPath(import.meta.url));
const msgDir = join(here, "..", "messages");
const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), "utf8"));

test("kit is non-empty and every bundle has the v1 envelope", () => {
  const kit = landingKit();
  assert.ok(kit.length >= 3, "kit should ship at least 3 components");
  for (const b of kit) {
    assert.equal(b.format, PORTABLE_FORMAT, `${b.component?.name}: wrong format`);
    assert.equal(b.version, PORTABLE_VERSION, `${b.component?.name}: wrong version`);
  }
});

test("every kit bundle passes the import gate (parsePortableComponent)", () => {
  for (const b of landingKit()) {
    const parsed = parsePortableComponent(b);
    assert.ok(
      parsed.ok,
      `bundle "${b.component.name}" rejected: ${parsed.ok ? "" : parsed.errors.join("; ")}`,
    );
    assert.equal(parsed.component.name, b.component.name);
  }
});

test("kit bundles also pass when serialized as a JSON string (paste/file path)", () => {
  for (const b of landingKit()) {
    const parsed = parsePortableComponent(JSON.stringify(b));
    assert.ok(parsed.ok, `string bundle "${b.component.name}" rejected`);
  }
});

test("component names are unique within the kit", () => {
  const names = landingKitNames();
  assert.equal(new Set(names).size, names.length, "duplicate component name in kit");
  assert.ok(names.includes("Hero"));
  assert.ok(names.includes("SiteFooter"));
});

test("kit i18n keys exist with identical keys in EN/FI/ET", () => {
  const want = ["kitsTitle", "kitsHint", "installLandingKit"];
  for (const l of ["en", "fi", "et"]) {
    const c = load(l).components;
    assert.ok(c, `${l}.json missing components namespace`);
    for (const k of want) {
      assert.ok(typeof c[k] === "string" && c[k].length > 0, `${l}.json missing components.${k}`);
    }
  }
});
