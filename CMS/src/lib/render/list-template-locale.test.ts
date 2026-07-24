/**
 * list-item-translatables — RENDER-side verification (feature ACs 3):
 * an UNBOUND translatable prop stored as a locale object on a List's TEMPLATE
 * child must (a) survive per-row stamping untouched (`stampRow` only writes
 * mapped names) and (b) resolve per content locale with default-locale fallback
 * through the EXISTING `resolveLocalized` path in planBlock. These pin behavior
 * that already existed — the feature's editing surface depends on it.
 *
 * Relative `.ts` imports — `node --test` can't resolve the `@/` alias (CAVEATS).
 * Run: node --test src/lib/render/list-template-locale.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planList } from "./plan-list.ts";
import { planPage, type Block, type ComponentArtifact, type ElementPlan } from "./tree.ts";

const LABEL = { en: "NEW", fi: "UUSI" };

function listBlock(): Block {
  return {
    id: "L1",
    component: "List",
    listSource: { collection: "content_restaurants" },
    listMap: { title: "name" }, // bound: row field → item prop
    listRows: [
      { id: "r1", name: "Sushi Bar" },
      { id: "r2", name: "Trattoria" },
    ],
    children: [
      {
        id: "tpl",
        component: "Card",
        listRole: "template",
        // `label` is NOT in listMap — static per-List text, stored per locale.
        props: { label: LABEL, title: "static placeholder" },
      },
    ],
  } as Block;
}

// ── stampRow non-interference (AC3, second half) ────────────────────────────

test("stamping writes ONLY mapped props; an unbound locale object passes through untouched", () => {
  const stamped: Block[] = [];
  const capture = (b: Block): ElementPlan => {
    stamped.push(b);
    return { kind: "element", tag: "span", props: {}, children: [] };
  };
  const block = listBlock();
  planList(block, capture);

  assert.equal(stamped.length, 2);
  // Mapped prop: each row's field value overwrote the static placeholder.
  assert.equal(stamped[0].props?.title, "Sushi Bar");
  assert.equal(stamped[1].props?.title, "Trattoria");
  // Unbound translatable: the locale object rode through by REFERENCE — stampRow
  // never rebuilt or resolved it.
  assert.equal(stamped[0].props?.label, LABEL);
  assert.equal(stamped[1].props?.label, LABEL);
  // The template itself is untouched (stamping clones).
  assert.deepEqual(block.children![0].props, { label: LABEL, title: "static placeholder" });
});

// ── per-locale resolution through planPage (AC3, first half) ────────────────

const card: ComponentArtifact = {
  name: "Card",
  tree: { tag: "div", props: {}, children: ["{{title}} — {{label}}"] },
  propsSchema: JSON.stringify({
    title: { type: "string", default: "—" },
    label: { type: "string", translatable: true, default: "NEW" },
  }),
} as unknown as ComponentArtifact;
const components = new Map<string, ComponentArtifact>([["Card", card]]);

/** Flatten every text node of a plan (depth-first). */
function textsOf(plan: ElementPlan, out: string[] = []): string[] {
  if (plan.kind === "text") out.push(plan.text);
  else for (const c of plan.children) textsOf(c, out);
  return out;
}

test("template locale object renders the ACTIVE locale per row", () => {
  const { root } = planPage([listBlock()], components, { locale: "fi", fallback: "en" });
  const texts = root.flatMap((p) => textsOf(p)).join("|");
  assert.match(texts, /Sushi Bar — UUSI/);
  assert.match(texts, /Trattoria — UUSI/);
});

test("a locale without a stored translation falls back to the default locale", () => {
  const { root } = planPage([listBlock()], components, { locale: "et", fallback: "en" });
  const texts = root.flatMap((p) => textsOf(p)).join("|");
  assert.match(texts, /Sushi Bar — NEW/);
});
