/**
 * localize-links — locale-prefix internal hrefs at plan time (Stage 1).
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { localizeHref, localizePlanLinks } from "./localize-links.ts";
import type { ElementPlan, LocaleContext } from "./plan-types.ts";

const CODES = ["en", "fi", "ro-ro", "es"];

// ── localizeHref ─────────────────────────────────────────────────────────────

test("prefixes an internal path with the active non-default locale", () => {
  assert.equal(localizeHref("/about", "fi", "en", CODES), "/fi/about");
  assert.equal(localizeHref("/blog/hello", "ro-ro", "en", CODES), "/ro-ro/blog/hello");
});

test("root path prefixes to the bare locale path (no trailing slash → no 308 hop)", () => {
  assert.equal(localizeHref("/", "fi", "en", CODES), "/fi");
  assert.equal(localizeHref("/?x=1", "fi", "en", CODES), "/fi?x=1");
  assert.equal(localizeHref("/#top", "fi", "en", CODES), "/fi#top");
});

test("query and hash ride along unchanged", () => {
  assert.equal(localizeHref("/about?x=1#team", "fi", "en", CODES), "/fi/about?x=1#team");
});

test("default locale never prefixes (case-insensitive)", () => {
  assert.equal(localizeHref("/about", "en", "en", CODES), "/about");
  assert.equal(localizeHref("/about", "EN", "en", CODES), "/about");
});

test("external, protocol-relative, anchor, mailto, relative, empty → untouched", () => {
  for (const href of [
    "https://example.com/x",
    "//cdn.example.com/x",
    "#section",
    "mailto:a@b.c",
    "about",
    "",
  ]) {
    assert.equal(localizeHref(href, "fi", "en", CODES), href);
  }
});

test("system paths are skipped: /media, /api, /admin, /preview, /_next", () => {
  for (const href of [
    "/media/logo.png",
    "/api/forms/submit",
    "/admin",
    "/admin/pages",
    "/preview/42",
    "/_next/static/x.js",
  ]) {
    assert.equal(localizeHref(href, "fi", "en", CODES), href);
  }
});

test("already-prefixed paths never double-prefix (any configured code, case/decode-insensitive)", () => {
  assert.equal(localizeHref("/fi/about", "fi", "en", CODES), "/fi/about");
  assert.equal(localizeHref("/es/about", "fi", "en", CODES), "/es/about");
  assert.equal(localizeHref("/RO-RO/x", "fi", "en", CODES), "/RO-RO/x");
  assert.equal(localizeHref("/f%69/about", "fi", "en", CODES), "/f%69/about");
});

test("skip-segment match is segment-exact: /apix and /mediakit still prefix", () => {
  assert.equal(localizeHref("/apix", "fi", "en", CODES), "/fi/apix");
  assert.equal(localizeHref("/mediakit/press", "fi", "en", CODES), "/fi/mediakit/press");
});

// ── localizePlanLinks ────────────────────────────────────────────────────────

const ctx = (locale: string): LocaleContext => ({
  locale,
  fallback: "en",
  available: CODES.map((code) => ({ code, label: code.toUpperCase() })),
});

test("rewrites hrefs at any depth, leaves everything else alone", () => {
  const plans: ElementPlan[] = [
    {
      kind: "element",
      tag: "div",
      props: { class: "x" },
      children: [
        {
          kind: "element",
          tag: "a",
          props: { href: "/pricing", class: "btn" },
          children: [{ kind: "text", text: "Pricing" }],
        },
        {
          kind: "element",
          tag: "a",
          props: { href: "https://x.com" },
          children: [],
        },
      ],
    },
  ];
  const out = localizePlanLinks(plans, ctx("fi"));
  const div = out[0] as Extract<ElementPlan, { kind: "element" }>;
  const a1 = div.children[0] as Extract<ElementPlan, { kind: "element" }>;
  const a2 = div.children[1] as Extract<ElementPlan, { kind: "element" }>;
  assert.equal(a1.props.href, "/fi/pricing");
  assert.equal(a1.props.class, "btn"); // sibling props preserved
  assert.equal(a2.props.href, "https://x.com");
  // input not mutated
  const origA1 = (plans[0] as Extract<ElementPlan, { kind: "element" }>)
    .children[0] as Extract<ElementPlan, { kind: "element" }>;
  assert.equal(origA1.props.href, "/pricing");
});

test("default-locale render returns the SAME array (identity no-op)", () => {
  const plans: ElementPlan[] = [
    { kind: "element", tag: "a", props: { href: "/about" }, children: [] },
  ];
  assert.equal(localizePlanLinks(plans, ctx("en")), plans);
});

test("no internal hrefs → same array back (no needless copies)", () => {
  const plans: ElementPlan[] = [
    { kind: "text", text: "hello" },
    { kind: "element", tag: "a", props: { href: "#top" }, children: [] },
  ];
  assert.equal(localizePlanLinks(plans, ctx("fi")), plans);
});

test("non-string href (bound object that failed to coerce) is untouched", () => {
  const plans: ElementPlan[] = [
    { kind: "element", tag: "a", props: { href: 7 }, children: [] },
  ];
  const out = localizePlanLinks(plans, ctx("fi"));
  assert.equal((out[0] as Extract<ElementPlan, { kind: "element" }>).props.href, 7);
});

// ── Stage-2: translate (localized slugs) ─────────────────────────────────────

const upFi = (path: string, locale: string): string =>
  locale === "fi" ? path.replace("/about", "/meista") : path;

test("localizeHref reverse-resolves the slug chain before prefixing", () => {
  assert.equal(localizeHref("/about/team", "fi", "en", CODES, upFi), "/fi/meista/team");
  // Skip checks run BEFORE translation: system + already-prefixed paths untouched.
  assert.equal(localizeHref("/api/about", "fi", "en", CODES, upFi), "/api/about");
  assert.equal(localizeHref("/fi/about", "fi", "en", CODES, upFi), "/fi/about");
  // Default locale: identity regardless of translate.
  assert.equal(localizeHref("/about", "en", "en", CODES, upFi), "/about");
});

test("localizePlanLinks uses LocaleContext.translatePath", () => {
  const locale: LocaleContext = { ...ctx("fi"), translatePath: upFi };
  const plans: ElementPlan[] = [
    { kind: "element", tag: "a", props: { href: "/about" }, children: [] },
  ];
  const out = localizePlanLinks(plans, locale);
  assert.equal(
    (out[0] as Extract<ElementPlan, { kind: "element" }>).props.href,
    "/fi/meista",
  );
});

test("without `available`, active+fallback still guard double-prefixing", () => {
  const locale: LocaleContext = { locale: "fi", fallback: "en" };
  const plans: ElementPlan[] = [
    { kind: "element", tag: "a", props: { href: "/fi/x" }, children: [] },
    { kind: "element", tag: "a", props: { href: "/y" }, children: [] },
  ];
  const out = localizePlanLinks(plans, locale);
  assert.equal((out[0] as Extract<ElementPlan, { kind: "element" }>).props.href, "/fi/x");
  assert.equal((out[1] as Extract<ElementPlan, { kind: "element" }>).props.href, "/fi/y");
});
