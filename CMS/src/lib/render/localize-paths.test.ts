import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPathTranslator,
  defaultPathForPage,
  pagePathsByLocale,
  type PathPageRow,
} from "./localize-paths.ts";
import { pathForLocale } from "./hreflang.ts";
import { publishedPagePaths } from "./sitemap-paths.ts";

/** A small page tree:
 *  /home (fi: koti)          — top-level HOME
 *  /about (fi: meista)
 *  /about/team (fi: tiimi, et: meeskond)
 *  /pricing                  — no overrides
 *  /cities/:city-slug/offers (offers fi: tarjoukset)
 */
const rows: PathPageRow[] = [
  { id: "home", slug: "home", parentPageId: null, localizedSlugs: '{"fi":"koti"}' },
  { id: "about", slug: "about", parentPageId: null, localizedSlugs: '{"fi":"meista"}' },
  {
    id: "team",
    slug: "team",
    parentPageId: "about",
    localizedSlugs: '{"fi":"tiimi","et":"meeskond"}',
  },
  { id: "pricing", slug: "pricing", parentPageId: null, localizedSlugs: "{}" },
  { id: "cities", slug: "cities", parentPageId: null, localizedSlugs: null },
  { id: "city", slug: ":city-slug", parentPageId: "cities", localizedSlugs: null },
  {
    id: "offers",
    slug: "offers",
    parentPageId: "city",
    localizedSlugs: '{"fi":"tarjoukset"}',
  },
];

const translate = createPathTranslator(rows, "en");

test("translates every overridden segment in the chain", () => {
  assert.equal(translate("/about", "fi"), "/meista");
  assert.equal(translate("/about/team", "fi"), "/meista/tiimi");
  assert.equal(translate("/about/team", "et"), "/about/meeskond");
});

test("default locale and locales without overrides return the SAME string", () => {
  assert.equal(translate("/about", "en"), "/about");
  const p = "/pricing";
  assert.equal(translate(p, "fi"), p, "no override → identity (same reference)");
});

test("query/hash suffixes pass through untranslated", () => {
  assert.equal(translate("/about/team?x=1#h", "fi"), "/meista/tiimi?x=1#h");
  assert.equal(translate("/?q=1", "fi"), "/?q=1", "root has no segments to translate");
});

test("wildcard segments keep their concrete value; deeper overrides still apply", () => {
  assert.equal(translate("/cities/tampere/offers", "fi"), "/cities/tampere/tarjoukset");
});

test("unmatched segments end translation and pass through unchanged", () => {
  assert.equal(translate("/no-such/about", "fi"), "/no-such/about");
  // Matched prefix still translates before the unmatched tail.
  assert.equal(translate("/about/nope", "fi"), "/meista/nope");
});

test("segments are URL-decoded for matching; overrides are re-encoded", () => {
  const r: PathPageRow[] = [
    { id: "a", slug: "a b", parentPageId: null, localizedSlugs: '{"fi":"ä ö"}' },
  ];
  const t = createPathTranslator(r, "en");
  assert.equal(t("/a%20b", "fi"), "/" + encodeURIComponent("ä ö"));
});

test("non-internal / malformed paths pass through", () => {
  assert.equal(translate("about", "fi"), "about");
  assert.equal(translate("//host/about", "fi"), "//host/about");
  assert.equal(translate("/", "fi"), "/");
});

test("defaultPathForPage walks the chain; HOME → '/'; wildcards need a param", () => {
  assert.equal(defaultPathForPage(rows, "home"), "/");
  assert.equal(defaultPathForPage(rows, "team"), "/about/team");
  assert.equal(
    defaultPathForPage(rows, "offers", { "city-slug": "tampere" }),
    "/cities/tampere/offers",
  );
  assert.equal(defaultPathForPage(rows, "offers", {}), null, "missing param value");
  assert.equal(defaultPathForPage(rows, "ghost"), null, "unknown page");
});

test("defaultPathForPage: dangling parents and cycles → null", () => {
  const dangling: PathPageRow[] = [
    { id: "x", slug: "x", parentPageId: "gone", localizedSlugs: null },
  ];
  assert.equal(defaultPathForPage(dangling, "x"), null);
  const cyclic: PathPageRow[] = [
    { id: "a", slug: "a", parentPageId: "b", localizedSlugs: null },
    { id: "b", slug: "b", parentPageId: "a", localizedSlugs: null },
  ];
  assert.equal(defaultPathForPage(cyclic, "a"), null);
});

test("pagePathsByLocale: per-locale full pathnames, prefix + localized chain", () => {
  const paths = pagePathsByLocale(rows, "team", {}, "en", ["en", "fi", "et"], translate);
  assert.deepEqual(paths, {
    en: "/about/team",
    fi: "/fi/meista/tiimi",
    et: "/et/about/meeskond",
  });
});

test("pagePathsByLocale: HOME page → '/' and '/fi' (no trailing slash)", () => {
  const paths = pagePathsByLocale(rows, "home", {}, "en", ["en", "fi"], translate);
  assert.deepEqual(paths, { en: "/", fi: "/fi" });
});

test("pagePathsByLocale: unreconstructible default path → undefined", () => {
  assert.equal(
    pagePathsByLocale(rows, "offers", {}, "en", ["en", "fi"], translate),
    undefined,
  );
});

// ── Sitemap seam: DEEPLY NESTED localized slugs (path-locales-edge-cache) ─────
// Guards the real sitemap pipeline (publishedPagePaths → createPathTranslator →
// pathForLocale) end-to-end for 3-level chains with MIXED overrides — the one
// integration path the per-helper unit tests didn't cover (flagged in NEXT.md).
// A per-segment override that drops out mid-chain must still translate the
// segments that DO have overrides; a wildcard ancestor must pass its captured
// value through while a deeper override still applies.
test("sitemap: 3-level chain, every segment overridden → full localized path", () => {
  const rows2 = [
    { id: "about", slug: "about", parentPageId: null, localizedSlugs: '{"fi":"meista"}', publishStatus: "published" },
    { id: "team", slug: "team", parentPageId: "about", localizedSlugs: '{"fi":"tiimi"}', publishStatus: "published" },
    { id: "lead", slug: "lead", parentPageId: "team", localizedSlugs: '{"fi":"johtaja"}', publishStatus: "published" },
  ];
  const t = createPathTranslator(rows2, "en");
  const leaf = publishedPagePaths(rows2).find((p) => p.segments.join("/") === "about/team/lead");
  assert.ok(leaf, "leaf enumerated");
  assert.equal(pathForLocale(leaf!.segments, "en", "en", t), "/about/team/lead");
  assert.equal(pathForLocale(leaf!.segments, "fi", "en", t), "/fi/meista/tiimi/johtaja");
});

test("sitemap: 3-level chain, MID segment has no override → only overridden segments change", () => {
  const rows2 = [
    { id: "about", slug: "about", parentPageId: null, localizedSlugs: '{"fi":"meista"}', publishStatus: "published" },
    { id: "team", slug: "team", parentPageId: "about", localizedSlugs: null, publishStatus: "published" },
    { id: "lead", slug: "lead", parentPageId: "team", localizedSlugs: '{"fi":"johtaja"}', publishStatus: "published" },
  ];
  const t = createPathTranslator(rows2, "en");
  const leaf = publishedPagePaths(rows2).find((p) => p.segments.join("/") === "about/team/lead");
  assert.equal(pathForLocale(leaf!.segments, "fi", "en", t), "/fi/meista/team/johtaja");
});

test("sitemap: wildcard ancestor keeps concrete value; deeper override still applies (nested)", () => {
  // /cities/:city/offers/detail — offers & detail override in fi; :city is
  // locale-agnostic but skipped by the sitemap (wildcard chain has no URL),
  // so translation is exercised via the translator directly on a concrete URL.
  const rows2 = [
    { id: "cities", slug: "cities", parentPageId: null, localizedSlugs: null },
    { id: "city", slug: ":city", parentPageId: "cities", localizedSlugs: null },
    { id: "offers", slug: "offers", parentPageId: "city", localizedSlugs: '{"fi":"tarjoukset"}' },
    { id: "detail", slug: "detail", parentPageId: "offers", localizedSlugs: '{"fi":"tiedot"}' },
  ];
  const t = createPathTranslator(rows2, "en");
  assert.equal(t("/cities/tampere/offers/detail", "fi"), "/cities/tampere/tarjoukset/tiedot");
});
