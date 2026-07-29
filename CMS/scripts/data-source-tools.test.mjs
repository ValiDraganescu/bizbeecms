/**
 * external-data-sources Slice 6 — tests for the AI data-source tools' PURE
 * parts (data-source-tools.ts): validateCreateDataSource / validateTestDataSource
 * arg shaping, formatSource (the model-facing DTO — must NEVER contain a secret),
 * and sampleForModel (context-size cap). The CF-coupled handlers (store CRUD,
 * secret decrypt, live fetch) live in tool-dispatch.ts and are build-verified;
 * the fetch engine itself is covered by data-source-fetch.test.mjs. Dep-free
 * `node --test`; imports the REAL .ts via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateCreateDataSource,
  validateTestDataSource,
  validateUpdateDataSource,
  validateSetDataSourceRequest,
  validateDeleteDataSource,
  validateDeleteDataSourceRequest,
  applySourcePatch,
  applyRequestPatch,
  formatSource,
  sampleForModel,
} from "../src/lib/chat/data-source-tools.ts";

// ── create_data_source ────────────────────────────────────────────────────────

test("create_data_source requires name and a valid baseUrl", () => {
  assert.equal(validateCreateDataSource(null).ok, false);
  assert.equal(validateCreateDataSource({ baseUrl: "https://api.example.com" }).ok, false);
  assert.equal(validateCreateDataSource({ name: "x", baseUrl: "not a url" }).ok, false);
  assert.equal(validateCreateDataSource({ name: "x", baseUrl: "https://localhost/api" }).ok, false); // SSRF guard
});

test("create_data_source: minimal public source (auth none, no secret)", () => {
  const r = validateCreateDataSource({ name: "Open-Meteo", baseUrl: "https://api.open-meteo.com" });
  assert.ok(r.ok);
  assert.equal(r.value.source.authType, "none");
  assert.equal(r.value.secret, null);
  assert.deepEqual(r.value.requests, []);
});

test("create_data_source: header/query/basic auth REQUIRE a secret", () => {
  const noSecret = validateCreateDataSource({
    name: "w", baseUrl: "https://api.example.com", authType: "header", authParam: "X-API-Key",
  });
  assert.equal(noSecret.ok, false);
  assert.match(noSecret.error, /secret/);
  // Self-correcting: the error must name the no-credential fallback so the
  // model creates with a dummy secret instead of stalling the conversation.
  assert.match(noSecret.error, /"PLACEHOLDER"/);
  assert.match(noSecret.error, /Admin → Data Sources/);

  const withSecret = validateCreateDataSource({
    name: "w", baseUrl: "https://api.example.com", authType: "header", authParam: "X-API-Key", secret: "k1",
  });
  assert.ok(withSecret.ok);
  assert.equal(withSecret.value.secret, "k1");
  assert.equal(withSecret.value.source.authParam, "X-API-Key");
});

test("create_data_source: inline saved requests are validated, errors name the index", () => {
  const bad = validateCreateDataSource({
    name: "w", baseUrl: "https://api.example.com",
    requests: [{ name: "ok", path: "v1/{city}" }, { name: "bad", path: "https://evil.example/abs" }],
  });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /requests\[1\]/);

  const good = validateCreateDataSource({
    name: "w", baseUrl: "https://api.example.com",
    requests: [{ name: "forecast", path: "v1/forecast", query: { q: "{city}" }, method: "GET" }],
  });
  assert.ok(good.ok);
  assert.equal(good.value.requests.length, 1);
  assert.equal(good.value.requests[0].cacheEnabled, true); // engine default
});

test("create_data_source rejects a non-array requests / non-string secret", () => {
  assert.equal(validateCreateDataSource({ name: "w", baseUrl: "https://a.example", requests: {} }).ok, false);
  assert.equal(validateCreateDataSource({ name: "w", baseUrl: "https://a.example", secret: 42 }).ok, false);
});

// ── test_data_source ──────────────────────────────────────────────────────────

test("test_data_source requires source and request refs", () => {
  assert.equal(validateTestDataSource(null).ok, false);
  assert.equal(validateTestDataSource({ request: "r" }).ok, false);
  assert.equal(validateTestDataSource({ source: "s" }).ok, false);
});

test("test_data_source shapes params (primitives only, exact bad key named)", () => {
  const ok = validateTestDataSource({ source: "s", request: "r", params: { city: "Turku", lat: 61.5, dry: true } });
  assert.ok(ok.ok);
  assert.deepEqual(ok.value.params, { city: "Turku", lat: 61.5, dry: true });

  const bad = validateTestDataSource({ source: "s", request: "r", params: { city: { nested: 1 } } });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /"city"/);

  assert.equal(validateTestDataSource({ source: "s", request: "r", params: [] }).ok, false);
});

// ── formatSource (the model-facing DTO) ───────────────────────────────────────

test("formatSource exposes placeholders + cache config, NEVER a secret", () => {
  const out = formatSource(
    { id: "src1", name: "Weather", baseUrl: "https://api.example.com", authType: "header", hasSecret: true },
    [{
      id: "req1", name: "forecast", method: "GET", path: "v1/{city}",
      query: { units: "{units}" }, bodyTemplate: null,
      cacheEnabled: true, cacheTtlSec: 60, retryable: false,
    }],
  );
  assert.equal(out.id, "src1");
  assert.equal(out.hasSecret, true);
  const req = out.requests[0];
  assert.deepEqual(req.placeholders, ["city", "units"]);
  assert.equal(req.hasBody, false);
  assert.equal(req.cacheTtlSec, 60);
  // The secret must not appear anywhere in the DTO, under any key.
  assert.ok(!JSON.stringify(out).toLowerCase().includes("secretenc"));
});

// ── sampleForModel (context-size cap) ─────────────────────────────────────────

test("sampleForModel passes small JSON through verbatim", () => {
  const data = { main: { temp: 21.3 }, list: [1, 2, 3] };
  assert.deepEqual(sampleForModel(data), data);
});

test("sampleForModel truncates a huge response to a string preview", () => {
  const huge = { blob: "x".repeat(20_000) };
  const out = sampleForModel(huge, 1_000);
  assert.equal(typeof out, "string");
  assert.ok(out.includes("truncated"));
  assert.ok(out.length < 1_200);
});

// ── update_data_source (mcp-full-crud-patch T3) ───────────────────────────────

test("update_data_source requires the source ref and at least one change", () => {
  const noRef = validateUpdateDataSource({ name: "x" });
  assert.equal(noRef.ok, false);
  assert.match(noRef.error, /source \(id or name\)/);

  const noChange = validateUpdateDataSource({ source: "Weather" });
  assert.equal(noChange.ok, false);
  assert.match(noChange.error, /nothing to change/);
  assert.match(noChange.error, /name, baseUrl, authType, authParam, secret/);
});

test("update_data_source: name/baseUrl cannot be cleared (null rejected, fix named)", () => {
  const name = validateUpdateDataSource({ source: "s", name: null });
  assert.equal(name.ok, false);
  assert.match(name.error, /`name` cannot be cleared/);
  assert.match(name.error, /omit `name` to keep/);

  const url = validateUpdateDataSource({ source: "s", baseUrl: null });
  assert.equal(url.ok, false);
  assert.match(url.error, /`baseUrl` cannot be cleared/);
});

test("update_data_source: authType null resets to 'none'; a bad value is named", () => {
  const reset = validateUpdateDataSource({ source: "s", authType: null });
  assert.ok(reset.ok);
  assert.equal(reset.value.patch.authType, "none");

  const bad = validateUpdateDataSource({ source: "s", authType: "bearer" });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /"bearer"/);
  assert.match(bad.error, /header, query, basic, oauth2, none/);
});

test("update_data_source: secret null/empty clears, string replaces, others rejected", () => {
  const cleared = validateUpdateDataSource({ source: "s", secret: null });
  assert.ok(cleared.ok);
  assert.equal(cleared.value.patch.secret, null);

  const emptied = validateUpdateDataSource({ source: "s", secret: "" });
  assert.ok(emptied.ok);
  assert.equal(emptied.value.patch.secret, null);

  const set = validateUpdateDataSource({ source: "s", secret: "k2" });
  assert.ok(set.ok);
  assert.equal(set.value.patch.secret, "k2");

  assert.equal(validateUpdateDataSource({ source: "s", secret: 42 }).ok, false);
});

const STORED_HEADER_SOURCE = {
  name: "Weather",
  baseUrl: "https://api.example.com/",
  authType: "header",
  authParam: "X-API-Key",
  hasSecret: true,
};

test("applySourcePatch: omitted fields keep stored values; omitted secret keeps stored secret", () => {
  const r = applySourcePatch(STORED_HEADER_SOURCE, { name: "Weather v2" });
  assert.ok(r.ok);
  assert.equal(r.value.source.name, "Weather v2");
  assert.equal(r.value.source.baseUrl, "https://api.example.com/");
  assert.equal(r.value.source.authType, "header");
  assert.equal(r.value.source.authParam, "X-API-Key");
  assert.equal(r.value.secret, undefined); // keep the stored credential
});

test("applySourcePatch: authType → 'none' clears the stored secret", () => {
  const r = applySourcePatch(STORED_HEADER_SOURCE, { authType: "none" });
  assert.ok(r.ok);
  assert.equal(r.value.source.authType, "none");
  assert.equal(r.value.secret, null);
});

test("applySourcePatch: authType 'none' + a supplied secret is a named conflict", () => {
  const r = applySourcePatch(STORED_HEADER_SOURCE, { authType: "none", secret: "k" });
  assert.equal(r.ok, false);
  assert.match(r.error, /authType "none" stores no secret/);
  assert.match(r.error, /drop the `secret` field/);
});

test("applySourcePatch: switching TO auth needs a secret stored or supplied", () => {
  const noneSource = { name: "Open", baseUrl: "https://api.example.com/", authType: "none", authParam: null, hasSecret: false };
  const missing = applySourcePatch(noneSource, { authType: "header", authParam: "X-API-Key" });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /no secret stored/);
  assert.match(missing.error, /"PLACEHOLDER"/);

  const supplied = applySourcePatch(noneSource, { authType: "header", authParam: "X-API-Key", secret: "k1" });
  assert.ok(supplied.ok);
  assert.equal(supplied.value.secret, "k1");
});

test("applySourcePatch: clearing the secret while auth still needs it is refused", () => {
  const r = applySourcePatch(STORED_HEADER_SOURCE, { secret: null });
  assert.equal(r.ok, false);
  assert.match(r.error, /clears the stored one/);
  assert.match(r.error, /set authType "none"/);
});

test("applySourcePatch re-enters the create-time gate (SSRF, authParam rules)", () => {
  const ssrf = applySourcePatch(STORED_HEADER_SOURCE, { baseUrl: "https://localhost/api" });
  assert.equal(ssrf.ok, false);
  assert.match(ssrf.error, /blocked internal host/);

  // header→query keeps the stored authParam; clearing it under header auth fails.
  const cleared = applySourcePatch(STORED_HEADER_SOURCE, { authParam: null });
  assert.equal(cleared.ok, false);
  assert.match(cleared.error, /authParam/);
});

// ── set_data_source_request ───────────────────────────────────────────────────

test("set_data_source_request requires source and request refs", () => {
  assert.equal(validateSetDataSourceRequest(null).ok, false);
  assert.equal(validateSetDataSourceRequest({ request: "r" }).ok, false);
  const noReq = validateSetDataSourceRequest({ source: "s" });
  assert.equal(noReq.ok, false);
  assert.match(noReq.error, /a match is patched, no match creates it/);
});

test("set_data_source_request: field type errors name the exact bad token", () => {
  const badQuery = validateSetDataSourceRequest({ source: "s", request: "r", query: { units: 5 } });
  assert.equal(badQuery.ok, false);
  assert.match(badQuery.error, /"units"/);
  assert.match(badQuery.error, /null to DELETE/);

  assert.equal(validateSetDataSourceRequest({ source: "s", request: "r", name: null }).ok, false);
  assert.equal(validateSetDataSourceRequest({ source: "s", request: "r", path: null }).ok, false);
  assert.equal(validateSetDataSourceRequest({ source: "s", request: "r", cacheTtlSec: "60" }).ok, false);
  assert.equal(validateSetDataSourceRequest({ source: "s", request: "r", query: [] }).ok, false);
});

test("set_data_source_request: null is accepted as reset for resettable fields", () => {
  const r = validateSetDataSourceRequest({
    source: "s", request: "r",
    method: null, bodyTemplate: null, cacheEnabled: null, cacheTtlSec: null, retryable: null,
    query: { stale: null },
  });
  assert.ok(r.ok);
  assert.deepEqual(r.value.patch, {
    method: null, bodyTemplate: null, cacheEnabled: null, cacheTtlSec: null, retryable: null,
    query: { stale: null },
  });
});

const STORED_REQUEST = {
  name: "forecast",
  method: "POST",
  path: "v1/{city}",
  query: { units: "metric", lang: "{lang}" },
  bodyTemplate: '{"q":"{city}"}',
  cacheEnabled: false,
  cacheTtlSec: 300,
  retryable: true,
};

test("applyRequestPatch: creating (no match) requires path, error names the ref + both intents", () => {
  const r = applyRequestPatch(null, "forcast", { cacheTtlSec: 120 });
  assert.equal(r.ok, false);
  assert.match(r.error, /"forcast"/);
  assert.match(r.error, /CREATE/);
  assert.match(r.error, /requires `path`/);
  assert.match(r.error, /PATCH an existing request/);
});

test("applyRequestPatch: create applies defaults, names the request after the ref", () => {
  const r = applyRequestPatch(null, "lookup", { path: "v2/{q}", query: { key: "abc", dead: null } });
  assert.ok(r.ok);
  assert.equal(r.value.action, "created");
  assert.equal(r.value.request.name, "lookup"); // `request` ref doubles as the name
  assert.equal(r.value.request.method, "GET");
  assert.equal(r.value.request.cacheEnabled, true);
  assert.equal(r.value.request.cacheTtlSec, 60);
  assert.equal(r.value.request.retryable, false);
  assert.deepEqual(r.value.request.query, { key: "abc" }); // null key on create = no-op

  const named = applyRequestPatch(null, "lookup", { name: "menu lookup", path: "v2" });
  assert.ok(named.ok);
  assert.equal(named.value.request.name, "menu lookup"); // explicit name wins
});

test("applyRequestPatch: update keeps omitted fields, replaces supplied scalars", () => {
  const r = applyRequestPatch(STORED_REQUEST, "forecast", { cacheTtlSec: 900 });
  assert.ok(r.ok);
  assert.equal(r.value.action, "updated");
  assert.equal(r.value.request.cacheTtlSec, 900);
  // Everything omitted stays exactly as stored — the observed re-default bug.
  assert.equal(r.value.request.name, "forecast");
  assert.equal(r.value.request.method, "POST");
  assert.equal(r.value.request.path, "v1/{city}");
  assert.deepEqual(r.value.request.query, { units: "metric", lang: "{lang}" });
  assert.equal(r.value.request.bodyTemplate, '{"q":"{city}"}');
  assert.equal(r.value.request.cacheEnabled, false);
  assert.equal(r.value.request.retryable, true);
});

test("applyRequestPatch: a patched bodyTemplate re-enters the JSON gate", () => {
  // QA repro: deleting the closing brace (via set_data_source_request or
  // edit_text) used to store an unbalanced template silently.
  const r = applyRequestPatch(STORED_REQUEST, "forecast", { bodyTemplate: '{"q":"{city}"' });
  assert.equal(r.ok, false);
  assert.match(r.error, /bodyTemplate must be valid JSON/);
});

test("applyRequestPatch: null resets a field to its default", () => {
  const r = applyRequestPatch(STORED_REQUEST, "forecast", {
    method: null, bodyTemplate: null, cacheEnabled: null, cacheTtlSec: null, retryable: null,
  });
  assert.ok(r.ok);
  assert.equal(r.value.request.method, "GET");
  assert.equal(r.value.request.bodyTemplate, null);
  assert.equal(r.value.request.cacheEnabled, true);
  assert.equal(r.value.request.cacheTtlSec, 60);
  assert.equal(r.value.request.retryable, false);
});

test("applyRequestPatch: query merges PER-KEY — null deletes, others stay", () => {
  const r = applyRequestPatch(STORED_REQUEST, "forecast", {
    query: { units: null, appid: "{key}" },
  });
  assert.ok(r.ok);
  assert.deepEqual(r.value.request.query, { lang: "{lang}", appid: "{key}" });
});

test("applyRequestPatch: an empty update patch is a named no-op error", () => {
  const r = applyRequestPatch(STORED_REQUEST, "forecast", {});
  assert.equal(r.ok, false);
  assert.match(r.error, /nothing to change on saved request "forecast"/);
});

test("applyRequestPatch re-enters the create-time gate on the MERGED result", () => {
  const badPath = applyRequestPatch(STORED_REQUEST, "forecast", { path: "v1/{bad" });
  assert.equal(badPath.ok, false);
  assert.match(badPath.error, /placeholder/);

  // method → GET while the stored body survives the merge = the shared gate's error.
  const getWithBody = applyRequestPatch(STORED_REQUEST, "forecast", { method: "GET" });
  assert.equal(getWithBody.ok, false);
  assert.match(getWithBody.error, /GET requests cannot have a body/);

  const ttl = applyRequestPatch(STORED_REQUEST, "forecast", { cacheTtlSec: 0 });
  assert.equal(ttl.ok, false);
  assert.match(ttl.error, /cacheTtlSec/);
});

// ── delete validators ─────────────────────────────────────────────────────────

test("delete_data_source_request / delete_data_source require their refs", () => {
  const noReq = validateDeleteDataSourceRequest({ source: "s" });
  assert.equal(noReq.ok, false);
  assert.match(noReq.error, /`source` and `request`/);
  assert.ok(validateDeleteDataSourceRequest({ source: "s", request: "r" }).ok);

  const noSrc = validateDeleteDataSource({});
  assert.equal(noSrc.ok, false);
  assert.match(noSrc.error, /list_data_sources/);
  assert.ok(validateDeleteDataSource({ source: "s" }).ok);
});
