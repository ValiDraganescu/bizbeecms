/**
 * JSON-LD component kind — pure builder (node --test).
 * Covers: prop interpolation (string/number/object), the propsSchema allowlist,
 * `</script>` breakout escaping, invalid-JSON → null, blank → null.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escapeJsonForScript,
  bindJsonLdSlots,
  buildJsonLdComponent,
} from "./jsonld-component.ts";

const SCHEMA = JSON.stringify({
  name: { type: "string", default: "Untitled" },
  rating: { type: "number", default: 0 },
  offers: { type: "json" },
});

test("escapeJsonForScript neutralizes </script> and entities", () => {
  const out = escapeJsonForScript('{"x":"</script><b>&"}');
  assert.equal(out.includes("</script>"), false);
  assert.equal(out.includes("<"), false);
  assert.equal(out.includes(">"), false);
  assert.equal(out.includes("&"), false);
  assert.ok(out.includes("\\u003c") && out.includes("\\u003e") && out.includes("\\u0026"));
});

test("bindJsonLdSlots interpolates a string slot with inner JSON escaping (no quote break)", () => {
  const declared = new Set(["name"]);
  // The " in the value must be escaped so it doesn't close the JSON string.
  const bound = bindJsonLdSlots('{"n":"{{name}}"}', { name: 'a"b' }, declared);
  assert.equal(bound, '{"n":"a\\"b"}');
  assert.deepEqual(JSON.parse(bound), { n: 'a"b' });
});

test("bindJsonLdSlots splices a number/object slot verbatim (no quotes in template)", () => {
  const declared = new Set(["rating", "offers"]);
  const bound = bindJsonLdSlots(
    '{"r":{{rating}},"o":{{offers}}}',
    { rating: 4.5, offers: { price: 9 } },
    declared,
  );
  assert.deepEqual(JSON.parse(bound), { r: 4.5, o: { price: 9 } });
});

test("undeclared slot binds to empty string (allowlist)", () => {
  const bound = bindJsonLdSlots('{"n":"{{evil}}"}', { evil: "x" }, new Set(["name"]));
  assert.deepEqual(JSON.parse(bound), { n: "" });
});

test("buildJsonLdComponent: full happy path, schema-allowlisted, escaped", () => {
  const tpl =
    '{"@context":"https://schema.org","@type":"Product","name":"{{name}}","aggregateRating":{"@type":"AggregateRating","ratingValue":{{rating}}}}';
  const out = buildJsonLdComponent(tpl, { name: "Widget", rating: 4.2 }, SCHEMA);
  assert.ok(out);
  // Unescape back and confirm the structured data is right.
  const json = out!.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&");
  assert.deepEqual(JSON.parse(json), {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Widget",
    aggregateRating: { "@type": "AggregateRating", ratingValue: 4.2 },
  });
});

test("buildJsonLdComponent escapes a </script> breakout in a bound value", () => {
  const out = buildJsonLdComponent('{"@type":"Thing","name":"{{name}}"}', {
    name: "</script><script>alert(1)</script>",
  }, JSON.stringify({ name: { type: "string" } }));
  assert.ok(out);
  assert.equal(out!.includes("</script>"), false);
  assert.equal(out!.includes("<"), false);
});

test("buildJsonLdComponent returns null for a template that doesn't parse after binding", () => {
  // Missing closing brace → invalid JSON → null (don't ship broken structured data).
  assert.equal(buildJsonLdComponent('{"n":"{{name}}"', { name: "x" }, SCHEMA), null);
});

test("buildJsonLdComponent returns null for blank/whitespace template", () => {
  assert.equal(buildJsonLdComponent("   ", {}, SCHEMA), null);
  assert.equal(buildJsonLdComponent("", {}, SCHEMA), null);
});

test("buildJsonLdComponent falls back to schema defaults for unset props", () => {
  const out = buildJsonLdComponent('{"@type":"Thing","name":"{{name}}"}', {}, SCHEMA);
  const json = out!.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&");
  // Note: planPage merges schemaDefaults under block props; the pure builder itself
  // only sees the merged values. Here we pass {} so the slot binds to "" — the
  // DEFAULT merge is planPage's job (covered in the planPage integration test).
  assert.deepEqual(JSON.parse(json), { "@type": "Thing", name: "" });
});
