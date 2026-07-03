/**
 * Pure tests for the Data Sources inline context formatter.
 * Runs under `node --test`; the module-level store/subscribers aren't exercised.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDataSourcesContext,
  MAX_CONTEXT_SOURCES,
  MAX_CONTEXT_REQUESTS,
  type DataSourceInfo,
  type DataSourceRequestInfo,
} from "./data-sources-context.ts";

function req(over: Partial<DataSourceRequestInfo> = {}): DataSourceRequestInfo {
  return {
    name: "Current weather",
    method: "GET",
    path: "/data/2.5/weather",
    query: { q: "{city}", units: "metric" },
    bodyTemplate: null,
    cacheEnabled: true,
    cacheTtlSec: 60,
    ...over,
  };
}

function src(over: Partial<DataSourceInfo> = {}): DataSourceInfo {
  return { name: "Weather API", authType: "header", requests: [req()], ...over };
}

test("null / no sources → empty string (nothing prepended)", () => {
  assert.equal(formatDataSourcesContext(null), "");
  assert.equal(formatDataSourcesContext(undefined), "");
  assert.equal(formatDataSourcesContext({ sources: [] }), "");
});

test("lists source name + auth kind and each request's method/path/params/cache", () => {
  const out = formatDataSourcesContext({ sources: [src()] });
  assert.match(out, /"Weather API" \(auth: header\)/);
  assert.match(out, /"Current weather": GET \/data\/2\.5\/weather/);
  assert.match(out, /params: \{city\}/); // placeholder pulled from the query template
  assert.match(out, /cache 60s/);
  assert.match(out, /get_data_sources_guide/); // steers the model to the playbook
  assert.match(out, /test_data_source/);
  // Binder tools are OUT of the data-sources context scope (ai-context-eng):
  // the tail must not name-drop tools the model can't call on this page.
  assert.doesNotMatch(out, /bind_component|create_list|bind_form/);
});

test("cache-off request says so; empty path renders as /; no-requests source noted", () => {
  const out = formatDataSourcesContext({
    sources: [
      src({
        requests: [req({ name: "Live uuid", path: "", query: {}, cacheEnabled: false })],
      }),
      src({ name: "Empty source", requests: [] }),
    ],
  });
  assert.match(out, /"Live uuid": GET \/; cache off/);
  assert.match(out, /"Empty source" \(auth: header\)\n {2}\(no saved requests\)/);
});

test("placeholders come from path AND body template, deduped", () => {
  const out = formatDataSourcesContext({
    sources: [
      src({
        requests: [
          req({
            path: "/users/{id}",
            query: {},
            bodyTemplate: '{"user": "{id}", "note": "{note}"}',
          }),
        ],
      }),
    ],
  });
  assert.match(out, /params: \{id\}, \{note\}/);
  assert.doesNotMatch(out, /\{id\}, \{id\}/); // no dupe in the params list
});

test("never leaks anything secret-ish (input shape has no such fields)", () => {
  const out = formatDataSourcesContext({ sources: [src()] });
  for (const bad of ["secret", "authParam", "X-API-Key", "baseUrl", "Bearer"]) {
    assert.equal(out.includes(bad), false, `output must not mention ${bad}`);
  }
});

test("overflow is capped and summarized for both sources and requests", () => {
  const manyReqs = Array.from({ length: MAX_CONTEXT_REQUESTS + 3 }, (_, i) =>
    req({ name: `R${i}` }),
  );
  const manySources = Array.from({ length: MAX_CONTEXT_SOURCES + 2 }, (_, i) =>
    src({ name: `S${i}`, requests: i === 0 ? manyReqs : [req()] }),
  );
  const out = formatDataSourcesContext({ sources: manySources });
  assert.match(out, /…and 3 more requests/);
  assert.match(out, /…and 2 more sources/);
  assert.doesNotMatch(out, new RegExp(`"S${MAX_CONTEXT_SOURCES}"`)); // capped source not listed
  assert.doesNotMatch(out, new RegExp(`"R${MAX_CONTEXT_REQUESTS}"`)); // capped request not listed
});
