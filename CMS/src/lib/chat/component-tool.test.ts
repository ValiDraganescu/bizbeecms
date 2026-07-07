/**
 * Pure validation for create/update_component, focused on the tags branch
 * (component-kits). node --test, no @/ imports.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateComponentArtifact } from "./component-tool.ts";

const HTML = `<div class="p-4"><h2>{{t title}}</h2></div>`;

test("tags are normalized onto the artifact when supplied", () => {
  const v = validateComponentArtifact({ name: "Hero", html: HTML, tags: ["Hero", "hero", " BasicRestaurant "] });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.artifact.tags, ["BasicRestaurant", "Hero"]); // deduped, trimmed, sorted
});

test("omitted tags leave the artifact field undefined (update won't wipe existing)", () => {
  const v = validateComponentArtifact({ name: "Hero", html: HTML });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.artifact.tags, undefined);
});

test("explicit empty array clears tags ([], not undefined)", () => {
  const v = validateComponentArtifact({ name: "Hero", html: HTML, tags: [] });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.artifact.tags, []);
});

test("junk tags are dropped, not rejected (untrusted-list safe)", () => {
  const v = validateComponentArtifact({ name: "Hero", html: HTML, tags: ["ok", 1, null, "  "] });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.artifact.tags, ["ok"]);
});

test("label is trimmed when supplied; omitted → undefined; '' → '' (clears)", () => {
  const a = validateComponentArtifact({ name: "HeroEmozione", html: HTML, label: "  Hero — Emozione  " });
  assert.equal(a.ok, true);
  if (a.ok) assert.equal(a.artifact.label, "Hero — Emozione");

  const b = validateComponentArtifact({ name: "HeroEmozione", html: HTML });
  assert.equal(b.ok, true);
  if (b.ok) assert.equal(b.artifact.label, undefined);

  const c = validateComponentArtifact({ name: "HeroEmozione", html: HTML, label: "" });
  assert.equal(c.ok, true);
  if (c.ok) assert.equal(c.artifact.label, "");
});

// ── JSON-LD component kind (seo-robots) ───────────────────────────────────────

const JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Product",
  name: "{{title}}",
  aggregateRating: { "@type": "AggregateRating", ratingValue: "{{rating}}" },
});

test("kind:'jsonld' → jsonTemplate carries the raw template, tree is empty, script/css blanked", () => {
  const v = validateComponentArtifact({ name: "ProductLD", kind: "jsonld", html: JSONLD, script: "alert(1)", css: "p-4" });
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.artifact.kind, "jsonld");
    assert.equal(v.artifact.jsonTemplate, JSONLD);
    assert.equal(v.artifact.script, ""); // ignored for jsonld
    assert.equal(v.artifact.css, "");
  }
});

test("html kind carries no kind when omitted (update leaves stored kind alone)", () => {
  const v = validateComponentArtifact({ name: "Hero", html: HTML });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.artifact.kind, undefined);
});

test("unquoted numeric/array slots don't fail the JSON-shape probe", () => {
  const tpl = '{"@context":"https://schema.org","@type":"Rating","ratingValue":{{score}},"list":{{items}}}';
  const v = validateComponentArtifact({ name: "RatingLD", kind: "jsonld", html: tpl });
  assert.equal(v.ok, true);
});

test("jsonld missing @context is rejected with a naming error", () => {
  const v = validateComponentArtifact({ name: "BadLD", kind: "jsonld", html: '{"@type":"Product","name":"x"}' });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.errors.some((e) => e.includes("@context")));
});

test("jsonld missing @type is rejected", () => {
  const v = validateComponentArtifact({ name: "BadLD", kind: "jsonld", html: '{"@context":"https://schema.org","name":"x"}' });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.errors.some((e) => e.includes("@type")));
});

test("jsonld template that isn't valid JSON is rejected with a self-correcting error", () => {
  const v = validateComponentArtifact({ name: "BadLD", kind: "jsonld", html: '{"@context": "https://schema.org", "@type": "Product",,}' });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.errors.some((e) => e.includes("not valid JSON")));
});

test("jsonld template that parses to an array (not an object) is rejected", () => {
  const v = validateComponentArtifact({ name: "BadLD", kind: "jsonld", html: '[{"@context":"https://schema.org","@type":"Product"}]' });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.errors.some((e) => e.includes("JSON OBJECT")));
});

test("empty jsonld html is rejected (would erase the component)", () => {
  const v = validateComponentArtifact({ name: "EmptyLD", kind: "jsonld", html: "  " });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.errors.some((e) => e.includes("empty")));
});

test("invalid kind value is rejected", () => {
  const v = validateComponentArtifact({ name: "X", kind: "microdata", html: HTML });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.errors.some((e) => e.includes('kind must be')));
});
