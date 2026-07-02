/**
 * P1 live-display check (2026-07-02, NOT part of the suite — run manually):
 * SSR the REAL BindingPanel + ListSettings with the REAL api-fixture-httpbingo
 * block JSON and assert the DATA SOURCE select shows the api source SELECTED
 * (before the fix it fell back to "— none —" for api-keyed bindings).
 * Form slice (b) extension: also SSRs FormSettings with the fixture's api- and
 * collection-target Form blocks (target selected, expected input names shown,
 * publicSubmissions-off warning present).
 *
 * Usage: node scripts/ssr-bind-panel-check.mjs [path-to-binding-panels.tsx]
 * (needs npm deps, no server; the optional arg lets you point it at an old
 * revision of the panel to demonstrate the failure)
 */
import { build } from "esbuild";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "scripts", ".ssr-bind-panel.bundle.mjs");

const panelPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "src", "components", "page-builder", "binding-panels.tsx");

await build({
  stdin: {
    contents: `export { BindingPanel, ListSettings, FormSettings } from ${JSON.stringify(panelPath)};`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  outfile: out,
  alias: { "@": path.join(root, "src") },
  external: ["react", "react-dom", "next-intl"],
  logLevel: "silent",
});

const { BindingPanel, ListSettings, FormSettings } = await import(pathToFileURL(out).href);
rmSync(out, { force: true }); // bundle no longer needed once imported
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { NextIntlClientProvider } = await import("next-intl");
const messages = JSON.parse(readFileSync(path.join(root, "messages", "en.json"), "utf8"));

const SOURCE_ID = "4cf4fb2a-cc5a-4cff-9d78-f0995e88f22b";
const apiSources = [
  {
    id: SOURCE_ID,
    name: "httpbingo fixture — public",
    requests: [
      { id: "094d8076-7544-41d0-960b-2c22620d4993", name: "GET echo (args)", method: "GET", path: "/get", query: "", bodyTemplate: null },
      { id: "041554cf-c6d0-4389-8d01-01c5746c3afc", name: "GET json", method: "GET", path: "/json", query: "", bodyTemplate: null },
    ],
  },
];

// The exact fx-get-echo block from the fixture draft (api-KEYED binding — the P1 trigger).
const singleBlock = {
  id: "fx-get-echo",
  component: "ApiProbe",
  bindings: {
    api: {
      source: { kind: "api", sourceId: SOURCE_ID, requestId: "094d8076-7544-41d0-960b-2c22620d4993" },
      map: { v1: "args.fixture.0", v2: "method", v3: "url" },
    },
  },
};

// The exact fx-slides-list block (listSource is read directly — control case).
const listBlock = {
  id: "fx-slides-list",
  component: "List",
  listSource: { kind: "api", sourceId: SOURCE_ID, requestId: "041554cf-c6d0-4389-8d01-01c5746c3afc", itemsPath: "slideshow.slides", direction: "grid", columns: 2, gap: 12 },
  listMap: { v1: "title", v2: "type" },
  children: [{ id: "fx-slide-tpl", component: "ApiProbe", listRole: "template" }],
};

function render(el) {
  return renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, { locale: "en", messages, timeZone: "UTC" }, el),
  );
}

const singleHtml = render(
  React.createElement(BindingPanel, {
    block: singleBlock,
    collections: [],
    apiSources,
    declared: ["v1", "v2", "v3"],
    onChange: () => {},
  }),
);
const listHtml = render(
  React.createElement(ListSettings, {
    block: listBlock,
    collections: [],
    apiSources,
    propsSchemas: { ApiProbe: '{"v1":{},"v2":{},"v3":{}}' },
    onChange: () => {},
  }),
);

// ── Form slice (b): FormSettings display (mirrors the fixture fx-forms blocks) ──
const POST_REQ_ID = "deec059d-0000-4000-8000-000000000000"; // fixture-style POST echo
const formApiSources = [
  {
    id: SOURCE_ID,
    name: "httpbingo fixture — public",
    requests: [
      { id: POST_REQ_ID, name: "POST echo", method: "POST", path: "/post", query: "", bodyTemplate: '{"msg":"{msg}"}' },
    ],
  },
];
const formApiBlock = {
  id: "fx-form-api",
  component: "Form",
  formTarget: { kind: "api", sourceId: SOURCE_ID, requestId: POST_REQ_ID, successMessage: "Echoed!" },
  children: [{ id: "fx-form-api-content", component: "FormProbeApi" }],
};
const formCollectionBlock = {
  id: "fx-form-contact",
  component: "Form",
  formTarget: { kind: "collection", collection: "content_form_fixture_enquiries", redirect: "/thanks" },
  children: [{ id: "fx-form-contact-content", component: "FormProbeContact" }],
};
const enquiryFields = [{ name: "name", type: "string" }, { name: "message", type: "string" }];
const formApiHtml = render(
  React.createElement(FormSettings, {
    block: formApiBlock,
    collections: [],
    apiSources: formApiSources,
    propsSchemas: { FormProbeApi: "{}", FormProbeContact: "{}" },
    onChange: () => {},
  }),
);
const formCollectionHtml = render(
  React.createElement(FormSettings, {
    block: formCollectionBlock,
    // publicSubmissions OFF → the warning must render.
    collections: [{ name: "Fixture enquiries", tableName: "content_form_fixture_enquiries", fields: enquiryFields, publicSubmissions: false }],
    apiSources: [],
    propsSchemas: { FormProbeApi: "{}", FormProbeContact: "{}" },
    onChange: () => {},
  }),
);
const formCollectionOnHtml = render(
  React.createElement(FormSettings, {
    block: formCollectionBlock,
    collections: [{ name: "Fixture enquiries", tableName: "content_form_fixture_enquiries", fields: enquiryFields, publicSubmissions: true }],
    apiSources: [],
    propsSchemas: { FormProbeApi: "{}", FormProbeContact: "{}" },
    onChange: () => {},
  }),
);

import assert from "node:assert/strict";
// React SSR marks the matching <option> of a controlled <select> with `selected`.
assert.match(singleHtml, new RegExp(`value="a:${SOURCE_ID}" selected=""`), "single-item panel must show the api source selected");
assert.match(singleHtml, /value="094d8076-7544-41d0-960b-2c22620d4993" selected=""/, "single-item panel must show the saved request selected");
assert.match(singleHtml, /value="args\.fixture\.0"/, "single-item panel must show the dot-path map");
assert.match(listHtml, new RegExp(`value="a:${SOURCE_ID}" selected=""`), "List panel must show the api source selected");
assert.match(listHtml, /value="slideshow\.slides"/, "List panel must show itemsPath");
// Form panel: api target selected + placeholder shown as an expected input name.
assert.match(formApiHtml, new RegExp(`value="a:${SOURCE_ID}" selected=""`), "Form panel must show the api source selected");
assert.match(formApiHtml, new RegExp(`value="${POST_REQ_ID}" selected=""`), "Form panel must show the saved request selected");
assert.match(formApiHtml, />msg</, "Form panel must list the request's {msg} placeholder as an input name");
assert.match(formApiHtml, /value="Echoed!"/, "Form panel must show the authored success message");
assert.match(formApiHtml, /value="FormProbeApi" selected=""/, "Form panel must show the content component selected");
// Form panel: collection target selected + schema fields + opt-in warning.
assert.match(formCollectionHtml, /value="c:content_form_fixture_enquiries" selected=""/, "Form panel must show the collection selected");
assert.match(formCollectionHtml, />name</, "Form panel must list the collection's fields as input names");
assert.match(formCollectionHtml, /role="alert"/, "Form panel must warn when publicSubmissions is OFF");
assert.match(formCollectionHtml, /value="\/thanks"/, "Form panel must show the authored redirect");
assert.ok(!/role="alert"/.test(formCollectionOnHtml), "no warning when publicSubmissions is ON");
console.log("OK: both bind panels + FormSettings display the fixture blocks (source/request/map/fields/messages).");
