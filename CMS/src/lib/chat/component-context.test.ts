/**
 * Pure tests for the Develop-workbench inline component context formatter.
 * Runs under `node --test`; the module-level store/subscribers aren't exercised.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatComponentContext } from "./component-context.ts";

test("null selection → empty string (nothing prepended)", () => {
  assert.equal(formatComponentContext(null), "");
  assert.equal(formatComponentContext(undefined), "");
});

test("embeds name and the full code (html/script/css/propsSchema)", () => {
  const out = formatComponentContext({
    name: "Hero",
    tree: { tag: "section", children: ["{{title}}"] },
    script: "console.log('hi')",
    css: ".hero{color:red}",
    propsSchema: '{"title":{"type":"string","default":"Welcome"}}',
  });
  assert.match(out, /"Hero"/);
  // The whole artifact must be present so the assistant needs no get_component.
  assert.match(out, /console\.log\('hi'\)/);
  assert.match(out, /\.hero\{color:red\}/);
  assert.match(out, /Welcome/);
  // The tree is shown to the model as Handlebars-HTML (the tool contract).
  assert.match(out, /html:\n<section>\{\{title\}\}<\/section>/);
});

test("empty script/css and absent propsSchema render as (none), not blank", () => {
  const out = formatComponentContext({
    name: "Bare",
    tree: { tag: "div", children: [] },
    script: "",
    css: "   ",
    propsSchema: null,
  });
  assert.match(out, /script:\n\(none\)/);
  assert.match(out, /css:\n\(none\)/);
  assert.match(out, /propsSchema:\n\(none\)/);
});

test("an html string is passed through verbatim (not double-encoded)", () => {
  const out = formatComponentContext({
    name: "X",
    tree: "<div>x</div>",
    script: "",
    css: "",
    propsSchema: null,
  });
  assert.match(out, /html:\n<div>x<\/div>/);
});
