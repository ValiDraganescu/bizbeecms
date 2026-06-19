/**
 * G1 regression: the blog starter kit.
 *
 *   1. Every shipped kit bundle is in the v1 portable format AND passes the
 *      SAME import trust boundary (`parsePortableComponent`) a manual import
 *      hits — so installing the kit can never persist a bundle the gate would
 *      reject (the install route re-validates before any write).
 *   2. Component names are unique within the kit (a dup would silently upsert
 *      over a sibling).
 *   3. The kit's i18n keys exist with IDENTICAL keys in EN/FI/ET (a missing key
 *      throws at render).
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
import { blogKit, blogKitNames } from "../src/lib/components/blog-kit.ts";
import { parsePropsSchema } from "../src/lib/pages/page-blocks.ts";

const here = dirname(fileURLToPath(import.meta.url));
const msgDir = join(here, "..", "messages");
const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), "utf8"));

test("kit is non-empty and every bundle has the v1 envelope", () => {
  const kit = blogKit();
  assert.ok(kit.length >= 3, "kit should ship at least 3 components");
  for (const b of kit) {
    assert.equal(b.format, PORTABLE_FORMAT, `${b.component?.name}: wrong format`);
    assert.equal(b.version, PORTABLE_VERSION, `${b.component?.name}: wrong version`);
  }
});

test("every kit bundle passes the import gate (parsePortableComponent)", () => {
  for (const b of blogKit()) {
    const parsed = parsePortableComponent(b);
    assert.ok(
      parsed.ok,
      `bundle "${b.component.name}" rejected: ${parsed.ok ? "" : parsed.errors.join("; ")}`,
    );
    // The validated component keeps its name (so the upsert targets the right row).
    assert.equal(parsed.component.name, b.component.name);
  }
});

test("kit bundles also pass when serialized as a JSON string (paste/file path)", () => {
  for (const b of blogKit()) {
    const parsed = parsePortableComponent(JSON.stringify(b));
    assert.ok(parsed.ok, `string bundle "${b.component.name}" rejected`);
  }
});

test("component names are unique within the kit", () => {
  const names = blogKitNames();
  assert.equal(new Set(names).size, names.length, "duplicate component name in kit");
  assert.ok(names.includes("BlogPostHeader"));
  assert.ok(names.includes("PostList"));
});

test("every component's propsSchema parses into the richer field vocab", () => {
  const byName = Object.fromEntries(blogKit().map((b) => [b.component.name, b.component]));

  // Every prop parses to a known field type; human-readable text props are translatable.
  for (const b of blogKit()) {
    const fields = parsePropsSchema(b.component.propsSchema);
    assert.ok(fields.length > 0, `${b.component.name}: schema parsed to no fields`);
    for (const f of fields) {
      assert.ok(
        ["string", "richtext", "number", "boolean", "select"].includes(f.type),
        `${b.component.name}.${f.name}: unknown field type ${f.type}`,
      );
    }
  }

  // Spot-check the semantics the upgrade adds.
  const header = parsePropsSchema(byName.BlogPostHeader.propsSchema);
  const title = header.find((f) => f.name === "title");
  assert.ok(title.required && title.translatable, "BlogPostHeader.title must be required + translatable");

  const item = parsePropsSchema(byName.PostListItem.propsSchema);
  const href = item.find((f) => f.name === "href");
  assert.ok(!href.translatable, "PostListItem.href (a URL) must NOT be translatable");

  const body = parsePropsSchema(byName.BlogPostBody.propsSchema).find((f) => f.name === "body");
  assert.equal(body.type, "richtext");
  assert.ok(body.translatable, "BlogPostBody.body must be translatable");
});

test("kit i18n keys exist with identical keys in EN/FI/ET", () => {
  const want = ["kitsTitle", "kitsHint", "installBlogKit", "kitInstalled"];
  for (const l of ["en", "fi", "et"]) {
    const c = load(l).components;
    assert.ok(c, `${l}.json missing components namespace`);
    for (const k of want) {
      assert.ok(typeof c[k] === "string" && c[k].length > 0, `${l}.json missing components.${k}`);
    }
  }
});
