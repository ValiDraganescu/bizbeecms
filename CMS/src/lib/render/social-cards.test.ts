import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOpenGraph, buildTwitterCard } from "./social-cards.ts";

test("buildOpenGraph: full input maps every field, type is website", () => {
  const og = buildOpenGraph({
    metaTitle: "Welcome",
    metaDescription: "A page",
    image: "https://cdn/x.png",
    brandName: "Acme",
    locale: "fi",
  });
  assert.deepEqual(og, {
    type: "website",
    title: "Welcome",
    description: "A page",
    siteName: "Acme",
    locale: "fi",
    images: [{ url: "https://cdn/x.png" }],
  });
});

test("buildOpenGraph: empty/absent fields drop out (undefined, not '')", () => {
  const og = buildOpenGraph({
    metaTitle: "",
    metaDescription: undefined,
    brandName: "   ",
    locale: "en",
  });
  assert.equal(og.title, undefined);
  assert.equal(og.description, undefined);
  assert.equal(og.siteName, undefined); // whitespace-only brand → dropped
  assert.equal(og.locale, "en");
  assert.equal(og.images, undefined); // no image
});

test("buildTwitterCard: summary_large_image when an image exists", () => {
  const t = buildTwitterCard({ metaTitle: "T", image: "https://cdn/x.png" });
  assert.equal(t.card, "summary_large_image");
  assert.deepEqual(t.images, ["https://cdn/x.png"]);
});

test("buildTwitterCard: plain summary when no image", () => {
  const t = buildTwitterCard({ metaTitle: "T", metaDescription: "D" });
  assert.equal(t.card, "summary");
  assert.equal(t.images, undefined);
  assert.equal(t.title, "T");
  assert.equal(t.description, "D");
});
