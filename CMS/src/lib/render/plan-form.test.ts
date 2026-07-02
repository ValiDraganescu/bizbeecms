/**
 * Built-in Form block: SSR shape (real <form> + hidden identity inputs +
 * status region), graceful un-targeted/un-hydrated fallback, page-id stamping,
 * and the enhancement-script asset shipping exactly once. (node --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planForm,
  stampFormPageId,
  FORM_SUBMIT_PATH,
  FORM_PAGE_FIELD,
  FORM_BLOCK_FIELD,
  FORM_DEFAULT_SUCCESS,
  FORM_DEFAULT_ERROR,
  FORM_ENHANCE_SCRIPT,
} from "./plan-form.ts";
import { planPage } from "./tree.ts";
import type { Block, ElementPlan } from "./plan-types.ts";

const planChild = (b: Block): ElementPlan => ({
  kind: "element",
  tag: "div",
  props: { "data-child": b.id },
  children: [],
});

const targeted: Block = {
  id: "f1",
  component: "Form",
  formTarget: { kind: "api", sourceId: "s", requestId: "r" },
  formPageId: "page-1",
  children: [{ id: "c1", component: "ContactCard" }],
};

test("targeted Form renders a <form> with method/action + identity inputs + status region", () => {
  const el = planForm(targeted, planChild);
  assert.equal(el.kind, "element");
  if (el.kind !== "element") return;
  assert.equal(el.tag, "form");
  assert.equal(el.props.method, "POST");
  assert.equal(el.props.action, FORM_SUBMIT_PATH);
  assert.equal(el.props["data-form"], "f1");
  // Default messages ride as data attrs for the enhancement script.
  assert.equal(el.props["data-form-success"], FORM_DEFAULT_SUCCESS);
  assert.equal(el.props["data-form-error"], FORM_DEFAULT_ERROR);

  const inputs = el.children.filter(
    (c) => c.kind === "element" && c.tag === "input",
  ) as Array<Extract<ElementPlan, { kind: "element" }>>;
  const byName = new Map(inputs.map((i) => [i.props.name, i.props.value]));
  assert.equal(byName.get(FORM_PAGE_FIELD), "page-1");
  assert.equal(byName.get(FORM_BLOCK_FIELD), "f1");

  // Children render inside the form; the status region is last.
  assert.ok(el.children.some((c) => c.kind === "element" && c.props["data-child"] === "c1"));
  const last = el.children[el.children.length - 1];
  assert.ok(last.kind === "element" && last.props["data-form-status"] === "");
});

test("authored success/error messages override the defaults", () => {
  const el = planForm(
    { ...targeted, formTarget: { ...targeted.formTarget, successMessage: "Kiitos!", errorMessage: "Virhe." } },
    planChild,
  );
  if (el.kind !== "element") return assert.fail("expected element");
  assert.equal(el.props["data-form-success"], "Kiitos!");
  assert.equal(el.props["data-form-error"], "Virhe.");
});

test("un-targeted or un-stamped Form degrades to a plain container (children intact)", () => {
  for (const block of [
    { ...targeted, formTarget: undefined },
    { ...targeted, formPageId: undefined },
  ]) {
    const el = planForm(block, planChild);
    if (el.kind !== "element") return assert.fail("expected element");
    assert.equal(el.tag, "div");
    assert.equal(el.props["data-form"], "f1");
    assert.equal(el.children.length, 1);
  }
});

test("stampFormPageId stamps nested Form blocks and no-ops without one", () => {
  const blocks: Block[] = [
    {
      id: "s1",
      component: "Section",
      children: [{ id: "col", component: "__section_column__", children: [{ ...targeted, formPageId: undefined }] }],
    },
  ];
  const stamped = stampFormPageId(blocks, "p9");
  const form = stamped[0].children?.[0].children?.[0];
  assert.equal(form?.formPageId, "p9");
  // No Form anywhere → the SAME array back (zero-cost common path).
  const plain: Block[] = [{ id: "x", component: "Hero" }];
  assert.equal(stampFormPageId(plain, "p9"), plain);
});

test("planPage ships the enhancement script once for a targeted Form, none otherwise", () => {
  const withForm = planPage([targeted, { ...targeted, id: "f2" }], new Map());
  assert.equal(withForm.scripts.filter((s) => s === FORM_ENHANCE_SCRIPT).length, 1);
  const withoutTarget = planPage([{ ...targeted, formTarget: undefined }], new Map());
  assert.equal(withoutTarget.scripts.includes(FORM_ENHANCE_SCRIPT), false);
});
