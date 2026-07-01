/**
 * Dep-free unit tests for external-data-sources Slice-2 central fetch engine
 * (src/lib/data-sources/fetch.ts — pure, node type-stripped). NO live API:
 * fetch/sleep/cache are injected.
 * Run: node --test scripts/data-source-fetch.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRequest,
  buildCacheKey,
  createMemoryCache,
  fetchSource,
  getPath,
  mapResponse,
} from "../src/lib/data-sources/fetch.ts";

const src = (over = {}) => ({
  id: "s1",
  baseUrl: "https://api.example.com/v2",
  authType: "none",
  authParam: null,
  secret: null,
  ...over,
});

const req = (over = {}) => ({
  id: "r1",
  method: "GET",
  path: "/weather",
  query: {},
  bodyTemplate: null,
  cacheEnabled: false,
  cacheTtlSec: 60,
  retryable: false,
  ...over,
});

/** Mock fetch returning queued responses (or throwing queued errors). */
function mockFetch(queue) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift() ?? queue.at(-1);
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  fn.calls = calls;
  return fn;
}

const noSleep = async () => {};

/* --------------------------------------------------------- buildRequest */

test("build: joins baseUrl + path, merges query", () => {
  const b = buildRequest(src(), req({ path: "weather", query: { units: "metric" } }));
  assert.equal(b.ok, true);
  assert.equal(b.value.url, "https://api.example.com/v2/weather?units=metric");
});

test("build: path placeholders are URL-encoded", () => {
  const b = buildRequest(src(), req({ path: "/city/{city}" }), { city: "São Paulo/BR" });
  assert.equal(b.ok, true);
  assert.equal(
    b.value.url,
    "https://api.example.com/v2/city/S%C3%A3o%20Paulo%2FBR",
  );
});

test("build: query placeholders encoded once via URLSearchParams", () => {
  const b = buildRequest(src(), req({ query: { q: "{city}", pair: "{lat},{lon}" } }), {
    city: "a&b=c",
    lat: 60.17,
    lon: 24.94,
  });
  assert.equal(b.ok, true);
  const u = new URL(b.value.url);
  assert.equal(u.searchParams.get("q"), "a&b=c");
  assert.equal(u.searchParams.get("pair"), "60.17,24.94");
});

test("build: missing param fails gracefully", () => {
  const b = buildRequest(src(), req({ path: "/city/{city}" }), {});
  assert.equal(b.ok, false);
  assert.match(b.error, /missing param "city"/);
});

test("build: header auth sets the named header", () => {
  const b = buildRequest(
    src({ authType: "header", authParam: "X-API-Key", secret: "sek" }),
    req(),
  );
  assert.equal(b.value.headers["X-API-Key"], "sek");
  assert.ok(!b.value.url.includes("sek"));
});

test("build: query auth appends the named param", () => {
  const b = buildRequest(
    src({ authType: "query", authParam: "appid", secret: "sek" }),
    req(),
  );
  assert.equal(new URL(b.value.url).searchParams.get("appid"), "sek");
});

test("build: basic auth base64s user:pass", () => {
  const b = buildRequest(src({ authType: "basic", secret: "u:p" }), req());
  assert.equal(b.value.headers["authorization"], `Basic ${btoa("u:p")}`);
});

test("build: body placeholders are JSON-escaped (no breakout)", () => {
  const b = buildRequest(
    src(),
    req({ method: "POST", bodyTemplate: '{"q":"{term}"}' }),
    { term: 'x", "admin": true, "y": "' },
  );
  assert.equal(b.ok, true);
  const parsed = JSON.parse(b.value.body);
  assert.equal(parsed.q, 'x", "admin": true, "y": "');
  assert.equal(parsed.admin, undefined);
  assert.equal(b.value.headers["content-type"], "application/json");
});

test("build: GET never gets a body", () => {
  const b = buildRequest(src(), req({ bodyTemplate: '{"a":1}' }));
  assert.equal(b.value.body, null);
});

/* ------------------------------------------------------------ cache key */

test("cacheKey: stable for same input, differs on body/method/source/version", () => {
  const b1 = buildRequest(src(), req({ method: "POST", bodyTemplate: '{"a":1}' })).value;
  const b2 = buildRequest(src(), req({ method: "POST", bodyTemplate: '{"a":2}' })).value;
  assert.equal(buildCacheKey("s1", b1), buildCacheKey("s1", b1));
  assert.notEqual(buildCacheKey("s1", b1), buildCacheKey("s1", b2));
  assert.notEqual(buildCacheKey("s1", b1), buildCacheKey("s2", b1));
  assert.notEqual(buildCacheKey("s1", b1), buildCacheKey("s1", b1, "1"));
  assert.ok(buildCacheKey("s1", b1).startsWith("ds:0:s1:"));
});

/* --------------------------------------------------------------- retries */

test("fetch: retries network errors up to 3 attempts, then fails gracefully", async () => {
  const f = mockFetch([new Error("boom"), new Error("boom"), new Error("boom")]);
  const r = await fetchSource(src(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(f.calls.length, 3);
});

test("fetch: retries 500/429 and succeeds on a later attempt", async () => {
  const f = mockFetch([{ status: 500 }, { status: 429 }, { status: 200, body: { t: 1 } }]);
  const r = await fetchSource(src(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { t: 1 });
  assert.equal(f.calls.length, 3);
});

test("fetch: never retries other 4xx", async () => {
  const f = mockFetch([{ status: 404 }]);
  const r = await fetchSource(src(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
  assert.equal(f.calls.length, 1);
});

test("fetch: POST does not retry unless marked retryable", async () => {
  const f1 = mockFetch([{ status: 500 }]);
  await fetchSource(src(), req({ method: "POST" }), {}, { fetch: f1, sleep: noSleep });
  assert.equal(f1.calls.length, 1);

  const f2 = mockFetch([{ status: 500 }, { status: 200, body: {} }]);
  const r = await fetchSource(
    src(),
    req({ method: "POST", retryable: true }),
    {},
    { fetch: f2, sleep: noSleep },
  );
  assert.equal(r.ok, true);
  assert.equal(f2.calls.length, 2);
});

test("fetch: non-JSON success body fails gracefully, no retry", async () => {
  const f = async () => new Response("<html>", { status: 200 });
  const r = await fetchSource(src(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.error, /not valid JSON/);
});

/* --------------------------------------------------------------- caching */

test("fetch: cache hit skips the network; TTL expiry refetches", async () => {
  let t = 0;
  const cache = createMemoryCache(() => t);
  const f = mockFetch([{ status: 200, body: { n: 1 } }, { status: 200, body: { n: 2 } }]);
  const r1 = await fetchSource(src(), req({ cacheEnabled: true, cacheTtlSec: 60 }), {}, { fetch: f, sleep: noSleep, cache });
  const r2 = await fetchSource(src(), req({ cacheEnabled: true, cacheTtlSec: 60 }), {}, { fetch: f, sleep: noSleep, cache });
  assert.deepEqual([r1.cached, r2.cached], [false, true]);
  assert.deepEqual(r2.data, { n: 1 });
  assert.equal(f.calls.length, 1);

  t = 61_000; // past TTL
  const r3 = await fetchSource(src(), req({ cacheEnabled: true, cacheTtlSec: 60 }), {}, { fetch: f, sleep: noSleep, cache });
  assert.equal(r3.cached, false);
  assert.deepEqual(r3.data, { n: 2 });
  assert.equal(f.calls.length, 2);
});

test("fetch: non-retryable POST is never cached even with cacheEnabled", async () => {
  const cache = createMemoryCache(() => 0);
  const f = mockFetch([{ status: 200, body: {} }]);
  await fetchSource(src(), req({ method: "POST", cacheEnabled: true }), {}, { fetch: f, sleep: noSleep, cache });
  await fetchSource(src(), req({ method: "POST", cacheEnabled: true }), {}, { fetch: f, sleep: noSleep, cache });
  assert.equal(f.calls.length, 2);
});

test("fetch: retryable POST-to-query IS cacheable (GraphQL-style)", async () => {
  const cache = createMemoryCache(() => 0);
  const f = mockFetch([{ status: 200, body: { d: 1 } }]);
  const rq = req({ method: "POST", retryable: true, cacheEnabled: true, bodyTemplate: '{"q":"x"}' });
  await fetchSource(src(), rq, {}, { fetch: f, sleep: noSleep, cache });
  const r2 = await fetchSource(src(), rq, {}, { fetch: f, sleep: noSleep, cache });
  assert.equal(r2.cached, true);
  assert.equal(f.calls.length, 1);
});

test("fetch: different params → different cache entries", async () => {
  const cache = createMemoryCache(() => 0);
  const f = mockFetch([{ status: 200, body: { c: "hki" } }, { status: 200, body: { c: "tll" } }]);
  const rq = req({ cacheEnabled: true, query: { q: "{city}" } });
  const r1 = await fetchSource(src(), rq, { city: "hki" }, { fetch: f, sleep: noSleep, cache });
  const r2 = await fetchSource(src(), rq, { city: "tll" }, { fetch: f, sleep: noSleep, cache });
  assert.deepEqual([r1.data, r2.data], [{ c: "hki" }, { c: "tll" }]);
  assert.equal(f.calls.length, 2);
});

/* --------------------------------------------------------------- mapping */

test("getPath: dot-paths incl. array indices; miss → undefined", () => {
  const json = { main: { temp: 21.5 }, list: [{ name: "a" }] };
  assert.equal(getPath(json, "main.temp"), 21.5);
  assert.equal(getPath(json, "list.0.name"), "a");
  assert.equal(getPath(json, "nope.x"), undefined);
  assert.equal(getPath(null, "a"), undefined);
});

test("mapResponse: object → one props-object; missing paths omitted", () => {
  const out = mapResponse({ main: { temp: 3 }, name: "Helsinki" }, { temp: "main.temp", city: "name", gone: "no.pe" });
  assert.deepEqual(out, { temp: 3, city: "Helsinki" });
});

test("mapResponse: array → props per element (List stamping)", () => {
  const out = mapResponse([{ t: { v: 1 } }, { t: { v: 2 } }], { val: "t.v" });
  assert.deepEqual(out, [{ val: 1 }, { val: 2 }]);
});

test("mapResponse: primitive / null → null (graceful)", () => {
  assert.equal(mapResponse("nope", { a: "b" }), null);
  assert.equal(mapResponse(null, { a: "b" }), null);
  assert.equal(mapResponse(42, { a: "b" }), null);
});
