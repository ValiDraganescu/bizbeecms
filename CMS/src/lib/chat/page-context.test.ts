/**
 * Inline page context (pure bits): the selected-section resolution and the
 * context strings it feeds — the prose naming the selection in
 * `formatPageContext`, and the per-message `[Selected section]` outline
 * (including its dedupe against an explicit @mention of the same section).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPageContext,
  findSelectedSection,
  formatSelectedSection,
  formatMentionedSections,
  type SectionMention,
} from "./page-context.ts";

const heroList = { id: "b-list", component: "List", children: [] };
const heroCol = { id: "b-col", component: "__section_column__", children: [heroList] };
const sections: SectionMention[] = [
  { id: "s-hero", name: "Hero", block: { id: "s-hero", component: "Section", children: [heroCol] } },
  { id: "s-cta", name: "Footer CTA", block: { id: "s-cta", component: "Section", children: [] } },
];

const page = {
  id: "p1",
  path: "/home",
  slug: "home",
  published: true,
  sections,
};

test("formatPageContext: no selection → names the page only", () => {
  const out = formatPageContext(page);
  assert.match(out, /editing the page "\/home"/);
  assert.doesNotMatch(out, /selected/);
});

test("formatPageContext: section itself selected → names it", () => {
  const out = formatPageContext({ ...page, selectedBlockId: "s-hero" });
  assert.match(out, /has the section "Hero" \(id: "s-hero"\) selected/);
});

test("formatPageContext: nested block selected → names block + enclosing section", () => {
  const out = formatPageContext({ ...page, selectedBlockId: "b-list" });
  assert.match(out, /a List block \(id: "b-list"\) selected/);
  assert.match(out, /inside the section "Hero" \(id: "s-hero"\)/);
});

test("formatPageContext: stale selection id → no selection sentence", () => {
  const out = formatPageContext({ ...page, selectedBlockId: "gone" });
  assert.doesNotMatch(out, /selected/);
});

test("findSelectedSection: resolves a deeply nested block to its section", () => {
  const sel = findSelectedSection(sections, "b-list");
  assert.equal(sel?.section.id, "s-hero");
  assert.equal(sel?.block.id, "b-list");
});

test("findSelectedSection: null/unknown ids resolve to null", () => {
  assert.equal(findSelectedSection(sections, null), null);
  assert.equal(findSelectedSection(sections, "nope"), null);
});

test("formatSelectedSection: outlines the section and names the nested selected block", () => {
  const out = formatSelectedSection("make it blue", findSelectedSection(sections, "b-list"));
  assert.match(out, /\[Selected section\] .* "Hero" \(id: s-hero\)/);
  assert.match(out, /The selected block within it is List \(id: b-list\)/);
  assert.match(out, /List \(id: b-list\)/); // outline includes the subtree
});

test("formatSelectedSection: section itself selected → no selected-block line", () => {
  const out = formatSelectedSection("tweak it", findSelectedSection(sections, "s-cta"));
  assert.match(out, /"Footer CTA" \(id: s-cta\)/);
  assert.doesNotMatch(out, /The selected block within it/);
});

test("formatSelectedSection: empty when nothing is selected", () => {
  assert.equal(formatSelectedSection("hello", null), "");
});

test("formatSelectedSection: defers to an explicit @mention of the same section", () => {
  const sel = findSelectedSection(sections, "b-list");
  assert.equal(formatSelectedSection("restyle `@Hero` please", sel), "");
  assert.equal(formatSelectedSection("restyle @Hero please", sel), "");
  // ...but a mention of a DIFFERENT section still injects the selected one.
  const both = formatSelectedSection("copy from @Footer CTA", sel);
  assert.match(both, /\[Selected section\]/);
  // and the mention pipeline covers the mentioned one, so nothing is lost.
  assert.match(formatMentionedSections("copy from @Footer CTA", sections), /Footer CTA/);
});
