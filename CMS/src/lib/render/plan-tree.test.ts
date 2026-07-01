/**
 * schemaDefaults + bindSlots fallback: an unset block prop must render its
 * authored `default`, never an empty string or the raw `{{slot}}`. (node --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { schemaDefaults, declaredProps, bindTree } from "./plan-tree.ts";

const SCHEMA = JSON.stringify({
  title: { type: "string", translatable: true, default: "A bowl of love" },
  cta: { type: "string", default: "Order Now" },
  href: { type: "string" }, // no default
});

test("schemaDefaults extracts each prop's default, omitting props without one", () => {
  assert.deepEqual(schemaDefaults(SCHEMA), { title: "A bowl of love", cta: "Order Now" });
});

test("schemaDefaults is empty for null/garbage", () => {
  assert.deepEqual(schemaDefaults(null), {});
  assert.deepEqual(schemaDefaults("not json"), {});
});

test("unset slot binds to its default; set slot overrides; no-default unset → ''", () => {
  const declared = declaredProps(SCHEMA);
  // The render path merges defaults under block props, then binds.
  const values = { ...schemaDefaults(SCHEMA), title: "Custom title" };
  const bound = bindTree("{{t title}} · {{cta}} · {{href}}", values, declared);
  // title set → override, cta unset → its default, href unset+no default → "".
  assert.equal(bound, "Custom title · Order Now · ");
});

// ── new-tab link augmentation (companion boolean → target/rel on the anchor) ──
const anchor = { tag: "a", props: { href: "{{ctaHref}}" }, children: ["Go"] };
const declaredLink = new Set(["ctaHref"]);

test("ctaHrefNewTab=true adds target/rel to the anchor bound from ctaHref", () => {
  const out = bindTree(anchor, { ctaHref: "/x", ctaHrefNewTab: true }, declaredLink) as {
    props: Record<string, unknown>;
  };
  assert.equal(out.props.href, "/x");
  assert.equal(out.props.target, "_blank");
  assert.equal(out.props.rel, "noopener noreferrer");
});

test("string 'true' also opts in (checkbox/JSON round-trips as string)", () => {
  const out = bindTree(anchor, { ctaHref: "/x", ctaHrefNewTab: "true" }, declaredLink) as {
    props: Record<string, unknown>;
  };
  assert.equal(out.props.target, "_blank");
});

test("no flag (or false) leaves the anchor same-tab (no target)", () => {
  const off = bindTree(anchor, { ctaHref: "/x", ctaHrefNewTab: false }, declaredLink) as {
    props: Record<string, unknown>;
  };
  assert.equal(off.props.target, undefined);
  const absent = bindTree(anchor, { ctaHref: "/x" }, declaredLink) as {
    props: Record<string, unknown>;
  };
  assert.equal(absent.props.target, undefined);
});

test("an author-set target on the anchor is never overridden", () => {
  const withTarget = { tag: "a", props: { href: "{{ctaHref}}", target: "_self" }, children: [] };
  const out = bindTree(withTarget, { ctaHref: "/x", ctaHrefNewTab: true }, declaredLink) as {
    props: Record<string, unknown>;
  };
  assert.equal(out.props.target, "_self");
  assert.equal(out.props.rel, undefined);
});

test("schema-level newTab default cascades via schemaDefaults; block false overrides", () => {
  // Develop's toggle stores `newTab:true` on the link prop's spec — schemaDefaults
  // expands it to the companion flag so unset blocks (and List-stamped items)
  // inherit it. A block's explicit false overlays the default and turns it off.
  const schema = JSON.stringify({ ctaHref: { type: "link", default: "/book", newTab: true } });
  const defaults = schemaDefaults(schema);
  assert.deepEqual(defaults, { ctaHref: "/book", ctaHrefNewTab: true });

  const inherited = bindTree(anchor, { ...defaults }, declaredLink) as {
    props: Record<string, unknown>;
  };
  assert.equal(inherited.props.target, "_blank");

  const overridden = bindTree(
    anchor,
    { ...defaults, ctaHrefNewTab: false },
    declaredLink,
  ) as { props: Record<string, unknown> };
  assert.equal(overridden.props.target, undefined);
});

test("new-tab only applies when href is a LONE slot, not mixed text", () => {
  const mixed = { tag: "a", props: { href: "/base/{{ctaHref}}" }, children: [] };
  const out = bindTree(mixed, { ctaHref: "x", ctaHrefNewTab: true }, declaredLink) as {
    props: Record<string, unknown>;
  };
  assert.equal(out.props.target, undefined);
});
