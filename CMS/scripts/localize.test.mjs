/**
 * Dep-free unit tests for per-Site content-locale resolution (epic C1).
 * Run: node --test scripts/localize.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidLocaleCode,
  normalizeLocaleCode,
  defaultContentLocales,
  normalizeContentLocales,
  isLocaleObject,
  resolveLocalized,
} from "../src/lib/render/localize.ts";
import { planTree, planPage } from "../src/lib/render/tree.ts";

// ── locale codes ─────────────────────────────────────────────────────────────
test("isValidLocaleCode: accepts en/fin/pt-br/zh-hans, rejects junk", () => {
  for (const ok of ["en", "fi", "fin", "pt-br", "zh-hans", "ET"]) {
    assert.equal(isValidLocaleCode(ok), true, ok);
  }
  for (const bad of ["", "english", "e", "label", "href1", "12"]) {
    assert.equal(isValidLocaleCode(bad), false, bad);
  }
});

test("normalizeLocaleCode: lowercases + trims", () => {
  assert.equal(normalizeLocaleCode(" EN "), "en");
  assert.equal(normalizeLocaleCode("PT-BR"), "pt-br");
});

// ── content-locale config ────────────────────────────────────────────────────
test("defaultContentLocales: en-only", () => {
  assert.deepEqual(defaultContentLocales(), { default: "en", locales: ["en"] });
});

test("normalizeContentLocales: garbage → safe default", () => {
  assert.deepEqual(normalizeContentLocales(null), { default: "en", locales: ["en"] });
  assert.deepEqual(normalizeContentLocales("nope"), { default: "en", locales: ["en"] });
  assert.deepEqual(normalizeContentLocales({}), { default: "en", locales: ["en"] });
});

test("normalizeContentLocales: dedupes, drops invalid, keeps default first", () => {
  const cfg = normalizeContentLocales({
    default: "fi",
    locales: ["en", "FI", "fi", "english", "sv"],
  });
  assert.equal(cfg.default, "fi");
  assert.deepEqual(cfg.locales, ["fi", "en", "sv"]);
});

test("normalizeContentLocales: default not in list → prepended", () => {
  const cfg = normalizeContentLocales({ default: "de", locales: ["en", "sv"] });
  assert.equal(cfg.default, "de");
  assert.deepEqual(cfg.locales, ["de", "en", "sv"]);
});

test("normalizeContentLocales: missing default falls back to first locale", () => {
  const cfg = normalizeContentLocales({ locales: ["sv", "en"] });
  assert.equal(cfg.default, "sv");
  assert.deepEqual(cfg.locales, ["sv", "en"]);
});

// ── isLocaleObject ───────────────────────────────────────────────────────────
test("isLocaleObject: all-locale-key objects only", () => {
  assert.equal(isLocaleObject({ en: "a", fi: "b" }), true);
  assert.equal(isLocaleObject({ en: "a", label: "b" }), false);
  assert.equal(isLocaleObject({}), false);
  assert.equal(isLocaleObject("en"), false);
  assert.equal(isLocaleObject(["en"]), false);
  assert.equal(isLocaleObject(null), false);
});

// ── resolveLocalized ─────────────────────────────────────────────────────────
test("resolveLocalized: picks active locale", () => {
  assert.equal(resolveLocalized({ en: "Hi", fi: "Moi" }, "fi", "en"), "Moi");
});

test("resolveLocalized: falls back to default then first present", () => {
  assert.equal(resolveLocalized({ en: "Hi", fi: "Moi" }, "sv", "en"), "Hi");
  assert.equal(resolveLocalized({ sv: "Hej" }, "de", "en"), "Hej");
});

test("resolveLocalized: primitives pass through", () => {
  assert.equal(resolveLocalized("plain", "fi", "en"), "plain");
  assert.equal(resolveLocalized(42, "fi", "en"), 42);
  assert.equal(resolveLocalized(null, "fi", "en"), null);
});

test("resolveLocalized: nested objects + arrays + deep locale objects", () => {
  const input = {
    title: { en: "Welcome", fi: "Tervetuloa" },
    className: "box",
    items: [{ label: { en: "A", fi: "Aa" } }, "static"],
    nested: { deep: { en: "X", fi: "Y" } },
  };
  assert.deepEqual(resolveLocalized(input, "fi", "en"), {
    title: "Tervetuloa",
    className: "box",
    items: [{ label: "Aa" }, "static"],
    nested: { deep: "Y" },
  });
});

test("resolveLocalized: does not mutate input", () => {
  const input = { t: { en: "a", fi: "b" } };
  resolveLocalized(input, "fi", "en");
  assert.deepEqual(input, { t: { en: "a", fi: "b" } });
});

// ── tree integration: planTree/planPage resolve props per-locale ─────────────
test("planTree: resolves localized props for active locale", () => {
  const plan = planTree(
    { tag: "h1", props: { title: { en: "Hi", fi: "Moi" }, className: "x" } },
    { locale: "fi", fallback: "en" },
  );
  assert.deepEqual(plan.props, { title: "Moi", className: "x" });
});

test("planTree: no locale context → props verbatim", () => {
  const plan = planTree({ tag: "h1", props: { title: { en: "Hi", fi: "Moi" } } });
  assert.deepEqual(plan.props, { title: { en: "Hi", fi: "Moi" } });
});

test("planPage: resolves component tree props to active locale", () => {
  const components = new Map([
    [
      "Hero",
      { name: "Hero", tree: { tag: "h1", props: { text: { en: "Hi", fi: "Moi" } } } },
    ],
  ]);
  const plan = planPage([{ id: "1", component: "Hero" }], components, {
    locale: "fi",
    fallback: "en",
  });
  // top-level non-Section blocks are wrapped in an id-only overlay div now
  const hero = plan.root[0].children[0];
  assert.equal(hero.kind, "element");
  assert.deepEqual(hero.props, { text: "Moi" });
});
