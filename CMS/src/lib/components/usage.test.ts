import { test } from "node:test";
import assert from "node:assert/strict";
import { findComponentUsage, type PageRefs, type ComponentDeps } from "./usage.ts";

const deps = (m: Record<string, string[]>): ComponentDeps =>
  new Map(Object.entries(m).map(([k, v]) => [k, new Set(v)]));

const pages: PageRefs[] = [
  { id: "p1", slug: "home", components: ["SiteHeader", "Hero"] },
  { id: "p2", slug: "about", components: ["NavBar"] },
  { id: "p3", slug: "contact", components: ["Hero"] },
];

test("direct reference: a page whose block names the target is direct", () => {
  const u = findComponentUsage("SiteHeader", pages, deps({}));
  assert.deepEqual(u, [{ pageId: "p1", slug: "home", title: undefined, direct: true }]);
});

test("transitive reference: target reached only through a component dep", () => {
  // NavBar embeds <LanguageSwitcher/>; the about page uses NavBar, not the switcher.
  const u = findComponentUsage("LanguageSwitcher", pages, deps({ NavBar: ["LanguageSwitcher"] }));
  assert.deepEqual(u, [{ pageId: "p2", slug: "about", title: undefined, direct: false }]);
});

test("direct-first ordering, then by slug", () => {
  // Hero is direct on home + contact; also reachable via NavBar→Hero on about.
  const u = findComponentUsage("Hero", pages, deps({ NavBar: ["Hero"] }));
  assert.deepEqual(
    u.map((x) => [x.slug, x.direct]),
    [
      ["contact", true],
      ["home", true],
      ["about", false],
    ],
  );
});

test("no match: a component nothing references is unused", () => {
  assert.deepEqual(findComponentUsage("Ghost", pages, deps({})), []);
});

test("dependency cycle doesn't hang (A→B→A), still resolves usage", () => {
  const cyclic = deps({ A: ["B"], B: ["A"] });
  const p: PageRefs[] = [{ id: "x", slug: "x", components: ["A"] }];
  // Target C is unreachable through the cycle → empty, and it terminates.
  assert.deepEqual(findComponentUsage("C", p, cyclic), []);
  // B is reachable A→B → transitive.
  assert.deepEqual(findComponentUsage("B", p, cyclic), [
    { pageId: "x", slug: "x", title: undefined, direct: false },
  ]);
});
