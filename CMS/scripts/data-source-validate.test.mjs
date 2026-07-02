/**
 * Dep-free unit tests for external-data-sources Slice-1 validation
 * (src/lib/data-sources/validate.ts — pure, node type-stripped).
 * Run: node --test scripts/data-source-validate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateBaseUrl,
  validateSourceInput,
  validateRequestInput,
  extractPlaceholders,
  hasValidPlaceholderSyntax,
  requestPlaceholders,
  DEFAULT_CACHE_TTL_SEC,
} from "../src/lib/data-sources/validate.ts";

/* ---------------------------------------------------------- baseUrl / SSRF */

test("baseUrl: accepts absolute http(s)", () => {
  assert.equal(validateBaseUrl("https://api.openweathermap.org/data/2.5").ok, true);
  assert.equal(validateBaseUrl("http://example.com").ok, true);
});

test("baseUrl: rejects non-http schemes, relative, empty", () => {
  assert.equal(validateBaseUrl("ftp://example.com").ok, false);
  assert.equal(validateBaseUrl("file:///etc/passwd").ok, false);
  assert.equal(validateBaseUrl("/data/2.5").ok, false);
  assert.equal(validateBaseUrl("").ok, false);
  assert.equal(validateBaseUrl(42).ok, false);
});

test("baseUrl: blocks internal hosts (SSRF)", () => {
  for (const bad of [
    "http://localhost:3000",
    "http://sub.localhost",
    "http://127.0.0.1/x",
    "http://10.1.2.3",
    "http://192.168.1.1",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://169.254.169.254/metadata",
    "http://0.0.0.0",
    "http://[::1]:8080",
    "http://my-db.internal",
    "http://printer.local",
  ]) {
    assert.equal(validateBaseUrl(bad).ok, false, `expected blocked: ${bad}`);
  }
  // public 172.x outside 16–31 is fine
  assert.equal(validateBaseUrl("http://172.15.0.1").ok, true);
  assert.equal(validateBaseUrl("http://172.32.0.1").ok, true);
});

/* ------------------------------------------------------------ placeholders */

test("placeholders: extracted distinct, first-seen order", () => {
  assert.deepEqual(extractPlaceholders("/weather?q={city}&u={units}&x={city}"), [
    "city",
    "units",
  ]);
  assert.deepEqual(extractPlaceholders("/plain/path"), []);
});

test("placeholders: syntax check catches stray braces", () => {
  assert.equal(hasValidPlaceholderSyntax("/w/{city}"), true);
  assert.equal(hasValidPlaceholderSyntax("/w/{city"), false);
  assert.equal(hasValidPlaceholderSyntax("/w/city}"), false);
  assert.equal(hasValidPlaceholderSyntax("/w/{9bad}"), false);
});

/* ----------------------------------------------------------------- source */

const goodSource = {
  name: "Weather",
  baseUrl: "https://api.openweathermap.org/data/2.5",
  authType: "query",
  authParam: "appid",
};

test("source: valid input normalizes", () => {
  const r = validateSourceInput(goodSource);
  assert.equal(r.ok, true);
  assert.equal(r.value.authType, "query");
  assert.equal(r.value.authParam, "appid");
});

test("source: name required, authType enum enforced", () => {
  assert.equal(validateSourceInput({ ...goodSource, name: "  " }).ok, false);
  assert.equal(validateSourceInput({ ...goodSource, authType: "digest" }).ok, false);
});

test("source: oauth2 requires a valid external token URL in authParam (Slice 8)", () => {
  // a header-name-ish authParam is not a token URL
  assert.equal(validateSourceInput({ ...goodSource, authType: "oauth2" }).ok, false);
  assert.equal(
    validateSourceInput({ ...goodSource, authType: "oauth2", authParam: null }).ok,
    false,
  );
  // token URL gets the same SSRF boundary as baseUrl
  assert.equal(
    validateSourceInput({
      ...goodSource,
      authType: "oauth2",
      authParam: "http://localhost/oauth/token",
    }).ok,
    false,
  );
  const ok = validateSourceInput({
    ...goodSource,
    authType: "oauth2",
    authParam: "https://auth.example.com/oauth2/token",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.authParam, "https://auth.example.com/oauth2/token");
});

test("source: header/query auth requires authParam; basic/none don't", () => {
  assert.equal(validateSourceInput({ ...goodSource, authParam: "" }).ok, false);
  assert.equal(
    validateSourceInput({ ...goodSource, authType: "header", authParam: "X-API-Key" }).ok,
    true,
  );
  const basic = validateSourceInput({ ...goodSource, authType: "basic", authParam: null });
  assert.equal(basic.ok, true);
  assert.equal(basic.value.authParam, null);
  const none = validateSourceInput({ name: "Pub", baseUrl: "https://x.dev", authType: "none" });
  assert.equal(none.ok, true);
});

/* ---------------------------------------------------------------- request */

const goodRequest = {
  name: "Current weather",
  method: "GET",
  path: "/weather",
  query: { q: "{city}", units: "metric" },
};

test("request: valid GET with defaults", () => {
  const r = validateRequestInput(goodRequest);
  assert.equal(r.ok, true);
  assert.equal(r.value.cacheEnabled, true);
  assert.equal(r.value.cacheTtlSec, DEFAULT_CACHE_TTL_SEC);
  assert.equal(r.value.retryable, false);
  assert.equal(r.value.bodyTemplate, null);
});

test("request: method enum incl. POST/PUT/DELETE; lowercase normalized", () => {
  assert.equal(validateRequestInput({ ...goodRequest, method: "post" }).value.method, "POST");
  assert.equal(validateRequestInput({ ...goodRequest, method: "PUT" }).ok, true);
  assert.equal(validateRequestInput({ ...goodRequest, method: "DELETE" }).ok, true);
  assert.equal(validateRequestInput({ ...goodRequest, method: "PATCH" }).ok, false);
});

test("request: path must be relative (no retargeting past the SSRF check)", () => {
  assert.equal(validateRequestInput({ ...goodRequest, path: "https://evil.dev/x" }).ok, false);
  assert.equal(validateRequestInput({ ...goodRequest, path: "//evil.dev/x" }).ok, false);
  assert.equal(validateRequestInput({ ...goodRequest, path: "/ok/{id}" }).ok, true);
});

test("request: malformed placeholder in path/query rejected", () => {
  assert.equal(validateRequestInput({ ...goodRequest, path: "/w/{city" }).ok, false);
  assert.equal(validateRequestInput({ ...goodRequest, query: { q: "{cit" } }).ok, false);
  assert.equal(validateRequestInput({ ...goodRequest, query: { q: 5 } }).ok, false);
});

test("request: body allowed on POST/PUT/DELETE (JSON braces legal), not GET", () => {
  const body = '{"query": "{search}", "n": 5}';
  const post = validateRequestInput({ ...goodRequest, method: "POST", bodyTemplate: body });
  assert.equal(post.ok, true);
  assert.equal(post.value.bodyTemplate, body);
  assert.equal(validateRequestInput({ ...goodRequest, bodyTemplate: body }).ok, false); // GET
});

test("request: cacheTtlSec bounds; retryable opt-in only when === true", () => {
  assert.equal(validateRequestInput({ ...goodRequest, cacheTtlSec: 0 }).ok, false);
  assert.equal(validateRequestInput({ ...goodRequest, cacheTtlSec: 86401 }).ok, false);
  assert.equal(validateRequestInput({ ...goodRequest, cacheTtlSec: 1.5 }).ok, false);
  assert.equal(validateRequestInput({ ...goodRequest, cacheTtlSec: 300 }).value.cacheTtlSec, 300);
  assert.equal(validateRequestInput({ ...goodRequest, retryable: "yes" }).value.retryable, false);
  assert.equal(validateRequestInput({ ...goodRequest, retryable: true }).value.retryable, true);
});

test("requestPlaceholders: distinct names across path + query + body, first-seen order", () => {
  const names = requestPlaceholders({
    path: "/weather/{city}",
    query: { units: "{units}", q: "{city}" },
    bodyTemplate: '{"region": "{region}", "n": 5}',
  });
  assert.deepEqual(names, ["city", "units", "region"]);
});

test("requestPlaceholders: JSON structural braces don't count; null body ok", () => {
  assert.deepEqual(
    requestPlaceholders({ path: "/static", query: {}, bodyTemplate: null }),
    [],
  );
  assert.deepEqual(
    requestPlaceholders({ path: "/x", query: {}, bodyTemplate: '{"a": {"b": 1}}' }),
    [],
  );
});
