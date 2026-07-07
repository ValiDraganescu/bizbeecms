import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditSeo,
  buildComponentSeoIndex,
  extractComponentSeo,
  type AuditPage,
} from "./seo-audit.ts";
import type { ContentLocales } from "./localize.ts";
import type { TreeNode } from "./plan-types.ts";

const LOCALES: ContentLocales = { default: "en", locales: ["en", "fi"] };

function page(p: Partial<AuditPage> & { id: string; slug: string }): AuditPage {
  return {
    parentPageId: null,
    publishStatus: "published",
    noindex: 0,
    blocks: [],
    metaTitle: { en: "T", fi: "T" },
    metaDescription: { en: "D", fi: "D" },
    ...p,
  };
}

test("missingMeta flags empty title/description per published locale", () => {
  const r = auditSeo(
    [page({ id: "1", slug: "home", metaTitle: { en: "Home" }, metaDescription: {} })],
    LOCALES,
  );
  // en: description missing; fi: both missing.
  const en = r.missingMeta.find((m) => m.locale === "en");
  const fi = r.missingMeta.find((m) => m.locale === "fi");
  assert.deepEqual(en?.missing, ["description"]);
  assert.deepEqual(fi?.missing.sort(), ["description", "title"]);
});

test("missingMeta skips drafts and noindexed pages", () => {
  const r = auditSeo(
    [
      page({ id: "1", slug: "home" }),
      page({ id: "2", slug: "draft", publishStatus: "draft", metaTitle: {}, metaDescription: {} }),
      page({ id: "3", slug: "hidden", noindex: 1, metaTitle: {}, metaDescription: {} }),
    ],
    LOCALES,
  );
  assert.equal(r.missingMeta.length, 0);
});

test("brokenLinks flags an internal link with no matching published page", () => {
  const r = auditSeo(
    [
      page({ id: "1", slug: "home", blocks: [
        { id: "b", component: "Hero", props: { href: "/pricing" } },
      ] }),
      page({ id: "2", slug: "about" }),
    ],
    LOCALES,
  );
  assert.equal(r.brokenLinks.length, 1);
  assert.equal(r.brokenLinks[0].href, "/pricing");
});

test("brokenLinks accepts a valid link (in default and locale-prefixed form)", () => {
  const blocks = [
    { id: "b1", component: "Hero", props: { href: "/about" } },
    { id: "b2", component: "Hero", props: { cta: "/fi/about" } },
  ];
  const r = auditSeo(
    [page({ id: "1", slug: "home", blocks }), page({ id: "2", slug: "about" })],
    LOCALES,
  );
  assert.equal(r.brokenLinks.length, 0);
});

test("brokenLinks ignores external, system, and hash links", () => {
  const blocks = [
    { id: "b", component: "Hero", props: {
      a: "https://x.com", b: "/media/logo.png", c: "/api/x", d: "#top", e: "mailto:x@y.z",
    } },
  ];
  const r = auditSeo([page({ id: "1", slug: "home", blocks })], LOCALES);
  assert.equal(r.brokenLinks.length, 0);
});

test("brokenLinks ignores links under a wildcard :param subtree", () => {
  const r = auditSeo(
    [
      page({ id: "1", slug: "home", blocks: [
        { id: "b", component: "Hero", props: { href: "/products/widget-42" } },
      ] }),
      page({ id: "2", slug: "products" }),
      page({ id: "3", slug: ":sku", parentPageId: "2" }),
    ],
    LOCALES,
  );
  assert.equal(r.brokenLinks.length, 0);
});

test("orphans flags a published page nothing links to; home never orphaned", () => {
  const r = auditSeo(
    [
      page({ id: "1", slug: "home", blocks: [
        { id: "b", component: "Hero", props: { href: "/about" } },
      ] }),
      page({ id: "2", slug: "about" }),
      page({ id: "3", slug: "lonely" }),
    ],
    LOCALES,
  );
  const slugs = r.orphans.map((o) => o.slug).sort();
  assert.deepEqual(slugs, ["lonely"]); // about is linked; home is exempt
});

test("orphans ignores draft pages", () => {
  const r = auditSeo(
    [
      page({ id: "1", slug: "home" }),
      page({ id: "2", slug: "wip", publishStatus: "draft" }),
    ],
    LOCALES,
  );
  assert.equal(r.orphans.length, 0);
});

test("missingAlt flags an image prop with no alt on a published page", () => {
  const r = auditSeo(
    [page({ id: "1", slug: "home", blocks: [
      { id: "b", component: "ImageBlock", props: { src: "/media/x.png", alt: "" } },
    ] })],
    LOCALES,
  );
  assert.equal(r.missingAlt.length, 1);
  assert.equal(r.missingAlt[0].src, "/media/x.png");
});

test("missingAlt passes when alt is present", () => {
  const r = auditSeo(
    [page({ id: "1", slug: "home", blocks: [
      { id: "b", component: "ImageBlock", props: { src: "/media/x.png", alt: "A photo" } },
    ] })],
    LOCALES,
  );
  assert.equal(r.missingAlt.length, 0);
});

test("missingAlt ignores non-image string props", () => {
  const r = auditSeo(
    [page({ id: "1", slug: "home", blocks: [
      { id: "b", component: "Hero", props: { src: "/not-an-image" } },
    ] })],
    LOCALES,
  );
  assert.equal(r.missingAlt.length, 0);
});

// ── Deep component-tree scan ─────────────────────────────────────────────────

const tree = (n: TreeNode): string => JSON.stringify(n);

test("extractComponentSeo pulls hrefs, images (with alt) and deps from a tree", () => {
  const seo = extractComponentSeo({
    tag: "div",
    children: [
      { tag: "a", props: { href: "/pricing" }, children: ["Buy"] },
      { tag: "img", props: { src: "/media/hero.png", alt: "" } },
      { tag: "img", props: { src: "/media/ok.png", alt: "Good" } },
      { tag: "AuthorCard", props: {} },
      { tag: "a", props: { href: "https://x.com" } }, // external, dropped
    ],
  });
  assert.deepEqual(seo.hrefs, ["/pricing"]);
  assert.deepEqual(seo.images, [
    { src: "/media/hero.png", alt: "" },
    { src: "/media/ok.png", alt: "Good" },
  ]);
  assert.deepEqual(seo.deps, ["AuthorCard"]);
});

test("deep scan flags a broken link authored INSIDE a referenced component", () => {
  const index = buildComponentSeoIndex([
    { name: "Nav", tree: tree({ tag: "a", props: { href: "/ghost" } }) },
  ]);
  const r = auditSeo(
    [
      page({ id: "1", slug: "home", blocks: [{ id: "b", component: "Nav", props: {} }] }),
      page({ id: "2", slug: "about" }),
    ],
    LOCALES,
    index,
  );
  assert.equal(r.brokenLinks.length, 1);
  assert.equal(r.brokenLinks[0].href, "/ghost");
});

test("deep scan flags a missing-alt image inside a referenced component", () => {
  const index = buildComponentSeoIndex([
    { name: "Card", tree: tree({ tag: "img", props: { src: "/media/x.png", alt: "" } }) },
  ]);
  const r = auditSeo(
    [page({ id: "1", slug: "home", blocks: [{ id: "b", component: "Card", props: {} }] })],
    LOCALES,
    index,
  );
  assert.equal(r.missingAlt.length, 1);
  assert.equal(r.missingAlt[0].src, "/media/x.png");
});

test("deep scan resolves a valid intra-component link (no false broken link) + counts inbound", () => {
  const index = buildComponentSeoIndex([
    { name: "Nav", tree: tree({ tag: "a", props: { href: "/about" } }) },
  ]);
  const r = auditSeo(
    [
      page({ id: "1", slug: "home", blocks: [{ id: "b", component: "Nav", props: {} }] }),
      page({ id: "2", slug: "about" }),
    ],
    LOCALES,
    index,
  );
  assert.equal(r.brokenLinks.length, 0);
  // /about is now linked (from inside the component), so it isn't an orphan.
  assert.equal(r.orphans.length, 0);
});

test("deep scan follows nested component refs transitively (cycle-safe)", () => {
  const index = buildComponentSeoIndex([
    { name: "Outer", tree: tree({ tag: "div", children: [{ tag: "Inner", props: {} }] }) },
    { name: "Inner", tree: tree({ tag: "a", props: { href: "/ghost" } }) },
    // Self-cycle must not infinite-loop.
    { name: "Loopy", tree: tree({ tag: "div", children: [{ tag: "Loopy", props: {} }] }) },
  ]);
  const r = auditSeo(
    [
      page({ id: "1", slug: "home", blocks: [
        { id: "b1", component: "Outer", props: {} },
        { id: "b2", component: "Loopy", props: {} },
      ] }),
      page({ id: "2", slug: "about" }),
    ],
    LOCALES,
    index,
  );
  assert.equal(r.brokenLinks.length, 1);
  assert.equal(r.brokenLinks[0].href, "/ghost");
});

test("buildComponentSeoIndex skips jsonld components and unparseable trees", () => {
  const index = buildComponentSeoIndex([
    { name: "Json", tree: tree({ tag: "a", props: { href: "/ghost" } }), kind: "jsonld" },
    { name: "Broken", tree: "{not json" },
  ]);
  assert.equal(index.has("Json"), false);
  assert.equal(index.has("Broken"), false);
});

test("no index → deep scan is skipped (backwards compatible)", () => {
  const r = auditSeo(
    [
      page({ id: "1", slug: "home", blocks: [{ id: "b", component: "Nav", props: {} }] }),
      page({ id: "2", slug: "about" }),
    ],
    LOCALES,
  );
  // Nav's internal /ghost is invisible without the index → no broken link.
  assert.equal(r.brokenLinks.length, 0);
});

test("nested children blocks are walked", () => {
  const r = auditSeo(
    [
      page({ id: "1", slug: "home", blocks: [
        { id: "sec", component: "Section", children: [
          { id: "col", component: "__section_column__", children: [
            { id: "cta", component: "Hero", props: { href: "/ghost" } },
          ] },
        ] },
      ] }),
      page({ id: "2", slug: "about" }),
    ],
    LOCALES,
  );
  assert.equal(r.brokenLinks.length, 1);
  assert.equal(r.brokenLinks[0].href, "/ghost");
});
