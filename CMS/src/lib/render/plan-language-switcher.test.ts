import { test } from "node:test";
import assert from "node:assert/strict";
import { planLanguageSwitcher } from "./plan-language-switcher.ts";
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
