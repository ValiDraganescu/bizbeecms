import { test } from "node:test";
import assert from "node:assert/strict";
import { planSection, columnStyle } from "./plan-section.ts";
import { type Block, type ElementPlan } from "./plan-types.ts";

// Gap unit plumbing (rule: every sizing control carries a rem/px unit picker).
// Legacy blocks (no gapUnit) must keep rendering px.

const planBlock = (b: Block): ElementPlan => ({
  kind: "element",
  tag: "span",
  props: { "data-tpl": b.component },
  children: [],
});

function section(props: Record<string, unknown>, rowProps: Record<string, unknown> = {}): Block {
  return {
    id: "S1",
    component: "Section",
    props,
    children: [
      {
        id: "R1",
        component: "__section_row__",
        props: rowProps,
        children: [{ id: "C1", component: "__section_column__", children: [] }],
      },
    ],
  };
}

const el = (p: ElementPlan) => {
  assert.equal(p.kind, "element");
  return p as Extract<ElementPlan, { kind: "element" }>;
};
const styleOf = (p: ElementPlan) =>
  (el(p).props as { style?: Record<string, unknown> }).style ?? {};

test("section gap: legacy px default, gapUnit rem honored, rows inherit value+unit", () => {
  const legacy = el(planSection(section({ gap: 16 }), planBlock));
  assert.equal(styleOf(legacy.children[0] as ElementPlan).gap, "16px");

  const rem = el(planSection(section({ gap: 2, gapUnit: "rem" }), planBlock));
  const wrapper = el(rem.children[0] as ElementPlan);
  assert.equal(styleOf(wrapper as ElementPlan).gap, "2rem");
  // The row has no gap of its own → inherits the section's "2rem".
  assert.equal(styleOf(wrapper.children[0] as ElementPlan).gap, "2rem");
});

test("row gap override carries its own unit", () => {
  const p = el(planSection(section({ gap: 2, gapUnit: "rem" }, { gap: 8 }), planBlock));
  const row = el(el(p.children[0] as ElementPlan).children[0] as ElementPlan);
  assert.equal(styleOf(row as ElementPlan).gap, "8px");
});

test("column gap: px default, rem via gapUnit", () => {
  assert.equal(columnStyle({ gap: 12 }, "flex-start", "flex-start").gap, "12px");
  assert.equal(columnStyle({ gap: 1.5, gapUnit: "rem" }, "flex-start", "flex-start").gap, "1.5rem");
});
