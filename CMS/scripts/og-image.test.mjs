/**
 * OG-image autogen — pure key-scheme + dims regression (dep-free node --test).
 *
 * The screenshot spike (screenshotPageToR2) needs a live BROWSER binding +
 * @cloudflare/puppeteer (paid Workers plan) — HITL only. Here we lock the pure
 * pieces: the R2 key scheme (og/ namespace, sanitized, distinct from assets/),
 * the key guard, and the OG dimensions. We also assert the spike SKIPS SILENTLY
 * when no binding/origin is available (never throws).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_CONTENT_TYPE,
  ogImageKey,
  isOgImageKey,
  ogImageUrl,
  resolveOgImageUrl,
  OG_IMAGE_ROUTE_PREFIX,
  screenshotPageToR2,
} from "../src/lib/render/og-image.ts";

test("OG dimensions are the 1200×630 large-card standard", () => {
  assert.equal(OG_IMAGE_WIDTH, 1200);
  assert.equal(OG_IMAGE_HEIGHT, 630);
  assert.equal(OG_IMAGE_CONTENT_TYPE, "image/png");
});

test("ogImageKey lives under og/ (never assets/) and carries id.locale.png", () => {
  assert.equal(ogImageKey("abc123", "en"), "og/abc123.en.png");
  assert.equal(ogImageKey("Page-42", "FI"), "og/page-42.fi.png");
  // never collides with the media upload namespace
  assert.ok(ogImageKey("x", "en").startsWith("og/"));
  assert.ok(!ogImageKey("x", "en").startsWith("assets/"));
});

test("ogImageKey sanitizes weird id/locale (no traversal, never empty)", () => {
  assert.equal(ogImageKey("../../etc", "en"), "og/etc.en.png");
  assert.equal(ogImageKey("a/b c", "e n"), "og/a-b-c.e-n.png");
  assert.equal(ogImageKey("", ""), "og/x.x.png");
  assert.equal(ogImageKey("!!!", "***"), "og/x.x.png");
});

test("isOgImageKey accepts minted keys, rejects everything else", () => {
  assert.ok(isOgImageKey(ogImageKey("abc", "en")));
  assert.ok(isOgImageKey("og/page-42.fi.png"));
  assert.ok(!isOgImageKey("assets/foo_123_ab.png")); // upload namespace
  assert.ok(!isOgImageKey("og/../secret.png")); // traversal
  assert.ok(!isOgImageKey("og/abc.en.jpg")); // wrong ext
  assert.ok(!isOgImageKey("og/abc.png")); // missing locale segment
});

test("ogImageUrl serves the R2 key under /api/ (catch-all-safe path)", () => {
  assert.equal(OG_IMAGE_ROUTE_PREFIX, "/api/");
  assert.equal(ogImageUrl(ogImageKey("abc", "en")), "/api/og/abc.en.png");
  // the served path minus /api/ is exactly the guarded R2 key
  assert.ok(isOgImageKey(ogImageUrl(ogImageKey("abc", "en")).slice("/api/".length)));
});

test("resolveOgImageUrl: manual metaImage ALWAYS wins (auto ignored)", () => {
  const r = resolveOgImageUrl({
    manualImage: "/media/assets/hero.png",
    autoExists: true,
    pageId: "p1",
    locale: "en",
    origin: "https://site.example",
  });
  assert.equal(r, "https://site.example/media/assets/hero.png");
});

test("resolveOgImageUrl: falls back to auto screenshot when it exists", () => {
  const r = resolveOgImageUrl({
    autoExists: true,
    pageId: "p1",
    locale: "fi",
    origin: "https://site.example",
  });
  assert.equal(r, "https://site.example/api/og/p1.fi.png");
});

test("resolveOgImageUrl: none when no manual image and no auto screenshot", () => {
  assert.equal(
    resolveOgImageUrl({ autoExists: false, pageId: "p1", locale: "en" }),
    undefined,
  );
  // blank/whitespace manual image is treated as absent
  assert.equal(
    resolveOgImageUrl({ manualImage: "   ", autoExists: false, pageId: "p1", locale: "en" }),
    undefined,
  );
});

test("resolveOgImageUrl: absolute manual URL is left untouched; no origin → root-relative", () => {
  assert.equal(
    resolveOgImageUrl({ manualImage: "https://cdn.x/y.png", pageId: "p1", locale: "en" }),
    "https://cdn.x/y.png",
  );
  assert.equal(
    resolveOgImageUrl({ autoExists: true, pageId: "p1", locale: "en" }),
    "/api/og/p1.en.png",
  );
  // trailing slash on origin is collapsed (no double slash)
  assert.equal(
    resolveOgImageUrl({ autoExists: true, pageId: "p1", locale: "en", origin: "https://x/" }),
    "https://x/api/og/p1.en.png",
  );
});

test("screenshotPageToR2 skips silently on empty url (no throw)", async () => {
  const r = await screenshotPageToR2("", "og/x.en.png");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no-origin");
});

test("screenshotPageToR2 returns no-binding in a bindingless env (no throw)", async () => {
  // node --test has no Cloudflare context → getCloudflareContext throws → error,
  // OR resolves with no BROWSER → no-binding. Either way it must NOT throw and
  // must report ok:false so a waitUntil caller can ignore it.
  const r = await screenshotPageToR2("https://example.com/", "og/x.en.png");
  assert.equal(r.ok, false);
  assert.ok(r.reason === "no-binding" || r.reason === "error");
});
