import { test } from "node:test";
import assert from "node:assert/strict";
import { auditSeo, type AuditPage } from "./seo-audit.ts";
import type { ContentLocales } from "./localize.ts";

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
