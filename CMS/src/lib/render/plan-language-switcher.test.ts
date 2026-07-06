import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planLanguageSwitcher,
  switchLocalePathname,
  LANGUAGE_SWITCHER_SCRIPT,
} from "./plan-language-switcher.ts";
import { planPage } from "./tree.ts";
import {
  LANGUAGE_SWITCHER_COMPONENT,
  type Block,
  type ComponentArtifact,
  type ElementPlan,
  type LocaleContext,
} from "./plan-types.ts";

const ctx = (
  active: string,
  codes: string[],
): LocaleContext => ({
  locale: active,
  fallback: codes[0],
  available: codes.map((c) => ({ code: c, label: c.toUpperCase() })),
});

/** Find the first element with a given tag anywhere in a plan subtree. */
function findTag(node: ElementPlan, tag: string): ElementPlan | null {
  if (node.kind !== "element") return null;
  if (node.tag === tag) return node;
  for (const c of node.children) {
    const hit = findTag(c, tag);
    if (hit) return hit;
  }
  return null;
}

test("renders a <select> of the locales with the active one as defaultValue", () => {
  let used = 0;
  const plan = planLanguageSwitcher(ctx("fi", ["en", "fi", "et"]), () => used++);
  assert.equal(plan.kind, "element");
  const sel = findTag(plan, "select");
  assert.ok(sel && sel.kind === "element", "a <select> is rendered");
  assert.equal(sel.props.defaultValue, "fi", "active locale is the default option");
  assert.equal(sel.children.length, 3, "one <option> per locale");
  assert.equal(used, 1, "the client-script asset is requested exactly once");
});

test("renders nothing (hidden) with fewer than two locales — nothing to switch", () => {
  let used = 0;
  const plan = planLanguageSwitcher(ctx("en", ["en"]), () => used++);
  assert.equal(findTag(plan, "select"), null, "no <select> for a single locale");
  assert.equal(used, 0, "no script shipped when the switcher doesn't render");
});

test("falls back to the first locale when the active code isn't in the set", () => {
  const plan = planLanguageSwitcher(ctx("zz", ["en", "fi"]), () => {});
  const sel = findTag(plan, "select");
  assert.ok(sel && sel.kind === "element");
  assert.equal(sel.props.defaultValue, "en");
});

test("planPage ships the switcher client script once for two switchers", () => {
  const blocks: Block[] = [
    { id: "a", component: LANGUAGE_SWITCHER_COMPONENT },
    { id: "b", component: LANGUAGE_SWITCHER_COMPONENT },
  ];
  const plan = planPage(blocks, new Map(), ctx("en", ["en", "fi"]));
  assert.equal(plan.scripts.length, 1, "the switcher script is deduped to one copy");
});

test("planPage renders no switcher script when there's nothing to switch", () => {
  const blocks: Block[] = [{ id: "a", component: LANGUAGE_SWITCHER_COMPONENT }];
  const plan = planPage(blocks, new Map(), ctx("en", ["en"]));
  assert.equal(plan.scripts.length, 0);
});

test("the <select> carries the default-locale attr the client rewrite needs", () => {
  const plan = planLanguageSwitcher(ctx("fi", ["en", "fi", "et"]), () => {});
  const sel = findTag(plan, "select");
  assert.ok(sel && sel.kind === "element");
  assert.equal(sel.props["data-bb-default-locale"], "en", "fallback (= default) is embedded");
});

test("options carry the plan-time per-locale path when pagePaths is present", () => {
  const locale: LocaleContext = {
    ...ctx("fi", ["en", "fi"]),
    pagePaths: { en: "/about/team", fi: "/fi/meista/tiimi" },
  };
  const plan = planLanguageSwitcher(locale, () => {});
  const sel = findTag(plan, "select");
  assert.ok(sel && sel.kind === "element");
  const [en, fi] = sel.children as Array<Extract<ElementPlan, { kind: "element" }>>;
  assert.equal(en.props["data-bb-path"], "/about/team");
  assert.equal(fi.props["data-bb-path"], "/fi/meista/tiimi");
});

test("options carry NO path attr without pagePaths (client rewrite fallback)", () => {
  const plan = planLanguageSwitcher(ctx("fi", ["en", "fi"]), () => {});
  const sel = findTag(plan, "select");
  assert.ok(sel && sel.kind === "element");
  for (const opt of sel.children) {
    assert.ok(opt.kind === "element");
    assert.equal("data-bb-path" in opt.props, false);
  }
});

test("switchLocalePathname: default → non-default prefixes the path", () => {
  const codes = ["en", "fi", "et"];
  assert.equal(switchLocalePathname("/about", "fi", "en", codes), "/fi/about");
  assert.equal(switchLocalePathname("/", "fi", "en", codes), "/fi");
  assert.equal(switchLocalePathname("/a/b", "et", "en", codes), "/et/a/b");
});

test("switchLocalePathname: non-default → default strips the prefix", () => {
  const codes = ["en", "fi", "et"];
  assert.equal(switchLocalePathname("/fi/about", "en", "en", codes), "/about");
  assert.equal(switchLocalePathname("/fi", "en", "en", codes), "/");
});

test("switchLocalePathname: non-default → non-default swaps the prefix", () => {
  const codes = ["en", "fi", "et"];
  assert.equal(switchLocalePathname("/fi/about", "et", "en", codes), "/et/about");
});

test("switchLocalePathname: prefix match is case-insensitive + URL-decoded (mirror of peelLocaleSegment)", () => {
  const codes = ["en", "ro-RO"];
  assert.equal(switchLocalePathname("/RO-ro/about", "en", "en", codes), "/about");
  assert.equal(switchLocalePathname("/ro%2DRO/x", "en", "en", codes), "/x");
});

test("switchLocalePathname: a leading segment equal to the DEFAULT locale is a slug, not a prefix", () => {
  const codes = ["en", "fi"];
  // /en/about when en is default = page slug "en" — never stripped.
  assert.equal(switchLocalePathname("/en/about", "fi", "en", codes), "/fi/en/about");
});

test("switchLocalePathname: unknown first segment is left alone", () => {
  const codes = ["en", "fi"];
  assert.equal(switchLocalePathname("/blog/post", "fi", "en", codes), "/fi/blog/post");
});

test("switchLocalePathname: target locale code is URL-encoded in the prefix", () => {
  const codes = ["en", "zh hant"]; // pathological code — must not break the path
  assert.equal(switchLocalePathname("/about", "zh hant", "en", codes), "/zh%20hant/about");
});

test("the client script navigates on published pages and only cookies under /preview/", () => {
  assert.ok(LANGUAGE_SWITCHER_SCRIPT.includes("location.assign"), "navigation path present");
  assert.ok(
    LANGUAGE_SWITCHER_SCRIPT.includes("'/preview/'"),
    "cookie fallback is gated to the preview iframe",
  );
  // The pure rewrite ships verbatim — a broken .toString() interpolation would
  // leave the placeholder or an empty body.
  assert.ok(LANGUAGE_SWITCHER_SCRIPT.includes("var rewrite = "), "rewrite fn interpolated");
  // Stage-2: the plan-time per-locale path wins over the client rewrite.
  assert.ok(
    LANGUAGE_SWITCHER_SCRIPT.includes("'data-bb-path'"),
    "plan-time option path is preferred",
  );
});

test("a component tree embedding <LanguageSwitcher/> resolves the built-in (not a placeholder)", () => {
  const navBar: ComponentArtifact = {
    name: "NavBar",
    tree: { tag: "nav", children: [{ tag: LANGUAGE_SWITCHER_COMPONENT }] },
    propsSchema: null,
  };
  const blocks: Block[] = [{ id: "n", component: "NavBar" }];
  const plan = planPage(
    blocks,
    new Map([["NavBar", navBar]]),
    ctx("fi", ["en", "fi"]),
  );
  const sel = plan.root.map((r) => findTag(r, "select")).find(Boolean);
  assert.ok(sel && sel.kind === "element", "<LanguageSwitcher/> tag became a <select>");
  assert.equal(plan.scripts.length, 1, "the switcher script ships via the tag path too");
});
