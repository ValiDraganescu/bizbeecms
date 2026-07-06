import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPathTranslator,
  defaultPathForPage,
  pagePathsByLocale,
  type PathPageRow,
} from "./localize-paths.ts";

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
