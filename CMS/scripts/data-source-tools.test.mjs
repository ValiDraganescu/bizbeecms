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
