/**
 * JSON-LD × bindings (seo-robots) — regression: collection/route-param bindings
 * interpolate into a jsonld component's template EXACTLY like they do into HTML
 * content, so wildcard `:param` detail pages get correct per-URL structured data.
 *
 * WHY no new seam is needed: `hydrateBlockBindings` (render-page.tsx) is
 * component-AGNOSTIC — it resolves `block.bindings` (single-item collection
 * query) via `hydrateProps` and route refs (`{param}`/`{query}`) via
 * `resolveRouteProps` INTO `block.props` BEFORE the pure walk. A jsonld block
 * then reads that same already-hydrated `block.props` in planPage (tree.ts),
 * identically to an html component. This test proves that hand-off end-to-end
 * with the SAME pure helpers the async host uses, so a dynamic detail page's
 * bound value lands (correctly escaped) in the emitted `application/ld+json`.
 *
 * Relative `.ts` imports — node --test can't resolve `@/` (CAVEATS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planPage, type Block, type ComponentArtifact } from "./tree.ts";
import { hydrateProps } from "../content/binding.ts";
import { resolveRouteProps, type RouteContext } from "../content/route-params.ts";

const productLd: ComponentArtifact = {
  name: "ProductLd",
  kind: "jsonld",
  tree: "",
  jsonTemplate:
    '{"@context":"https://schema.org","@type":"Product","name":"{{name}}","aggregateRating":{"@type":"AggregateRating","ratingValue":{{rating}}}}',
  propsSchema: JSON.stringify({
    name: { type: "string", default: "Untitled" },
    rating: { type: "number", default: 0 },
    slug: { type: "string" },
  }),
};
const components = new Map<string, ComponentArtifact>([["ProductLd", productLd]]);

function unescape(s: string): string {
  return s.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&");
}

/** Reproduce the render host's per-block hand-off: bound collection row +
 *  route refs → block.props, exactly as hydrateBlockBindings does before planPage. */
function hydrate(
  block: Block,
  rows: Record<string, Record<string, unknown> | null>,
  ctx: RouteContext,
): Block {
  const props = resolveRouteProps(hydrateProps(block.props, block.bindings, rows), ctx);
  return { ...block, props };
}

test("a collection-bound row interpolates into a jsonld component (per-URL structured data)", () => {
  // Author binds `name`/`rating` from a `products` collection row (the row the
  // wildcard `:slug` matched). hydrateProps copies the row fields onto props.
  const block: Block = {
    id: "b1",
    component: "ProductLd",
    bindings: {
      p: { source: { collection: "products" }, map: { name: "title", rating: "stars" } },
    },
  };
  const hydrated = hydrate(block, { p: { title: "Deluxe Widget", stars: 4.7 } }, {
    params: {},
    query: {},
  });
  const { jsonLd } = planPage([hydrated], components);
  assert.ok(jsonLd && jsonLd.length === 1);
  assert.deepEqual(JSON.parse(unescape(jsonLd![0])), {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Deluxe Widget",
    aggregateRating: { "@type": "AggregateRating", ratingValue: 4.7 },
  });
});

test("a route-param ref on a jsonld prop resolves to the current URL segment", () => {
  // `name` echoes the matched `:slug` wildcard param — the detail page's own URL.
  const block: Block = {
    id: "b1",
    component: "ProductLd",
    props: { name: { param: "slug" } },
  };
  const hydrated = hydrate(block, {}, { params: { slug: "acme-1200" }, query: {} });
  const { jsonLd } = planPage([hydrated], components);
  assert.equal(JSON.parse(unescape(jsonLd![0])).name, "acme-1200");
});

test("a bound value with a </script> breakout is escaped through the full pipeline", () => {
  // A malicious/dirty collection field must not break out of the ld+json script.
  const block: Block = {
    id: "b1",
    component: "ProductLd",
    bindings: { p: { source: { collection: "products" }, map: { name: "title" } } },
  };
  const hydrated = hydrate(block, { p: { title: '</script><script>alert(1)</script>"evil' } }, {
    params: {},
    query: {},
  });
  const { jsonLd } = planPage([hydrated], components);
  assert.ok(jsonLd && jsonLd.length === 1);
  assert.equal(jsonLd![0].includes("</script>"), false);
  assert.equal(jsonLd![0].includes("<"), false);
  // And it's still valid, correctly-escaped JSON carrying the raw text.
  assert.equal(
    JSON.parse(unescape(jsonLd![0])).name,
    '</script><script>alert(1)</script>"evil',
  );
});

test("an unresolved binding leaves the schema default (no lying structured data)", () => {
  // The wildcard slug matched no row (rows.p = null) → hydrateProps leaves props
  // untouched → planPage applies the schema default. A detail page for a missing
  // item still emits well-formed (if generic) JSON, never a broken script.
  const block: Block = {
    id: "b1",
    component: "ProductLd",
    bindings: { p: { source: { collection: "products" }, map: { name: "title" } } },
  };
  const hydrated = hydrate(block, { p: null }, { params: {}, query: {} });
  const { jsonLd } = planPage([hydrated], components);
  assert.equal(JSON.parse(unescape(jsonLd![0])).name, "Untitled");
});
