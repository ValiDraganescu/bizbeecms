/**
 * HTML/SVG attribute → React prop normalization (the createElement boundary).
 * Pins the fixes for the React DOM warnings seen in the wild: hyphenated SVG
 * attrs, class/for, dropped inline handlers, and uncontrolled static form state.
 *
 * Relative `.ts` import — `node --test` can't resolve the `@/` alias (CAVEATS).
 * Run: npx tsc --noEmit && node --test src/lib/render/react-props.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlPropsToReact } from "./react-props.ts";

test("hyphenated SVG attrs camelCase", () => {
  const out = htmlPropsToReact("path", {
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": "2",
    "fill-rule": "evenodd",
  });
  assert.deepEqual(out, {
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "2",
    fillRule: "evenodd",
  });
});

test("class/for → className/htmlFor; data-/aria- pass through verbatim", () => {
  const out = htmlPropsToReact("div", {
    class: "p-4",
    for: "x",
    "data-cb-value": "1",
    "aria-selected": "false",
  });
  assert.equal(out.className, "p-4");
  assert.equal(out.htmlFor, "x");
  // NOT camelCased — React passes these through as-is.
  assert.equal(out["data-cb-value"], "1");
  assert.equal(out["aria-selected"], "false");
});

test("inline event handlers are dropped (string values React can't bind)", () => {
  const out = htmlPropsToReact("form", {
    onsubmit: "doThing()",
    onClick: "x()",
    className: "f",
  });
  assert.equal("onsubmit" in out, false);
  assert.equal("onClick" in out, false);
  assert.equal(out.className, "f"); // non-handler kept
});

test("static form state → uncontrolled default* props", () => {
  // `selected` on <option> → defaultSelected; `value` on <option> is a normal
  // attribute (not a controlled-input value), so it stays as `value`.
  assert.deepEqual(htmlPropsToReact("option", { selected: true, value: "a" }), {
    defaultSelected: true,
    value: "a",
  });
  assert.deepEqual(htmlPropsToReact("input", { checked: true, value: "x" }), {
    defaultChecked: true,
    defaultValue: "x",
  });
  // `value` on a NON-form element is left alone (e.g. an SVG/li data carrier).
  assert.deepEqual(htmlPropsToReact("li", { value: "v" }), { value: "v" });
  // `selected` only special-cased on <option>, not elsewhere.
  assert.deepEqual(htmlPropsToReact("div", { selected: true }), { selected: true });
});

test("already-camel / plain props pass through unchanged", () => {
  const out = htmlPropsToReact("div", { strokeWidth: "2", className: "c", id: "i" });
  assert.deepEqual(out, { strokeWidth: "2", className: "c", id: "i" });
});
