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

/* -------------------------------------------------------------- size cap */

test("fetch: oversized content-length header rejects before reading, no retry", async () => {
  let calls = 0;
  const f = async () => {
    calls++;
    return new Response('{"ok":true}', {
      status: 200,
      headers: { "content-length": String(50_000_000) },
    });
  };
  const r = await fetchSource(src(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.error, /too large/);
  assert.equal(calls, 1);
});

test("fetch: oversized buffered body (no content-length) rejects, not cached", async () => {
  const cache = createMemoryCache();
  const big = `{"pad":"${"x".repeat(6_000_000)}"}`;
  const f = async () => {
    const res = new Response(big, { status: 200 });
    res.headers.delete("content-length");
    return res;
  };
  const r = await fetchSource(
    src(),
    req({ cacheEnabled: true }),
    {},
    { fetch: f, sleep: noSleep, cache },
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /too large/);
  // nothing cached: a fresh cacheable call must hit the network again
  const r2 = await fetchSource(
    src(),
    req({ cacheEnabled: true }),
    {},
    { fetch: async () => new Response('{"n":1}', { status: 200 }), sleep: noSleep, cache },
  );
  assert.deepEqual([r2.ok, r2.cached], [true, false]);
});

test("fetch: body under the cap still parses fine", async () => {
  const f = async () => new Response('{"n":42}', { status: 200 });
  const r = await fetchSource(src(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { n: 42 });
});

test("fetch: chunked oversized body aborts MID-STREAM, never fully buffered", async () => {
  // 20 chunks × 1MB = 20MB offered with NO content-length header — the cap
  // must cancel the reader at ~5MB, not buffer everything then measure.
  const chunk = new TextEncoder().encode("x".repeat(1_000_000));
  const totalChunks = 20;
  let pulled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (pulled >= totalChunks) {
        controller.close();
        return;
      }
      pulled++;
      controller.enqueue(chunk);
    },
  });
  const f = async () => new Response(stream, { status: 200 });
  const r = await fetchSource(src(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.error, /too large/);
  assert.ok(
    pulled < totalChunks,
    `pulled ${pulled}/${totalChunks} chunks — body was fully buffered, no early abort`,
  );
});

test("oauth2: oversized token response rejects gracefully", async () => {
  const big = `{"access_token":"${"x".repeat(6_000_000)}"}`;
  const f = async () => new Response(big, { status: 200 });
  const r = await fetchSource(
    src({ authType: "oauth2", authParam: "https://auth.example.com/token", secret: "id:sec" }),
    req(),
    {},
    { fetch: f, sleep: noSleep },
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /token response too large/);
});

/* ------------------------------------------------------------- redirects */

/** Fetch that maps url → {status, body?, location?} and records calls. */
function redirectFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = routes[url];
    if (!r) throw new Error(`unexpected fetch to ${url}`);
    const headers = { "content-type": "application/json" };
    if (r.location) headers.location = r.location;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers });
  };
  fn.calls = calls;
  return fn;
}

test("redirect: cross-origin redirect is rejected — attacker host never fetched, no secret leak", async () => {
  const f = redirectFetch({
    "https://api.example.com/v2/weather": { status: 302, location: "http://169.254.169.254/latest" },
  });
  const r = await fetchSource(
    src({ authType: "header", authParam: "X-API-Key", secret: "sek" }),
    req(),
    {},
    { fetch: f, sleep: noSleep },
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /different host/);
  assert.equal(f.calls.length, 1); // no retry either — same redirect would recur
  assert.equal(f.calls[0].url, "https://api.example.com/v2/weather");
});

test("redirect: same-origin redirect is followed with manual redirect mode", async () => {
  const f = redirectFetch({
    "https://api.example.com/v2/weather": { status: 301, location: "/v3/weather" },
    "https://api.example.com/v3/weather": { status: 200, body: { n: 7 } },
  });
  const r = await fetchSource(src(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { n: 7 });
  assert.equal(f.calls.length, 2);
  for (const c of f.calls) assert.equal(c.init.redirect, "manual");
});

test("redirect: http→https upgrade on the same host is allowed; downgrade is not", async () => {
  const up = redirectFetch({
    "http://api.example.com/v2/weather": { status: 301, location: "https://api.example.com/v2/weather" },
    "https://api.example.com/v2/weather": { status: 200, body: { ok: 1 } },
  });
  const r1 = await fetchSource(
    src({ baseUrl: "http://api.example.com/v2" }),
    req(),
    {},
    { fetch: up, sleep: noSleep },
  );
  assert.equal(r1.ok, true);

  const down = redirectFetch({
    "https://api.example.com/v2/weather": { status: 301, location: "http://api.example.com/v2/weather" },
  });
  const r2 = await fetchSource(src(), req(), {}, { fetch: down, sleep: noSleep });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /different host/);
});

test("redirect: hop count is capped", async () => {
  const routes = {};
  for (let i = 0; i < 10; i++) {
    routes[`https://api.example.com/v2/weather${i === 0 ? "" : `-${i}`}`] = {
      status: 302,
      location: `/v2/weather-${i + 1}`,
    };
  }
  const f = redirectFetch(routes);
  const r = await fetchSource(src(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.error, /too many upstream redirects/);
  assert.equal(f.calls.length, 4); // original + MAX_REDIRECTS hops
});

test("redirect: 302 on POST re-issues as GET without body (same origin)", async () => {
  const f = redirectFetch({
    "https://api.example.com/v2/weather": { status: 302, location: "/v2/created" },
    "https://api.example.com/v2/created": { status: 200, body: { done: true } },
  });
  const r = await fetchSource(
    src(),
    req({ method: "POST", bodyTemplate: '{"a":1}' }),
    {},
    { fetch: f, sleep: noSleep },
  );
  assert.equal(r.ok, true);
  assert.equal(f.calls[1].init.method, "GET");
  assert.equal(f.calls[1].init.body, null);
});

test("redirect: missing Location is graceful", async () => {
  const f = redirectFetch({
    "https://api.example.com/v2/weather": { status: 302 },
  });
  const r = await fetchSource(src(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.error, /without a Location/);
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

/* ---------------------------------------------------- oauth2 (Slice 8) */

const oauthSrc = (over = {}) =>
  src({
    authType: "oauth2",
    authParam: "https://auth.example.com/oauth2/token",
    secret: "my-client:my-secret",
    ...over,
  });

/** URL-routed mock fetch: token endpoint vs API, each with its own queue. */
function mockOauthFetch({ token = [], api = [] }) {
  const calls = { token: [], api: [] };
  const fn = async (url, init) => {
    const isToken = String(url).startsWith("https://auth.example.com/");
    const bucket = isToken ? "token" : "api";
    calls[bucket].push({ url, init });
    const queue = isToken ? token : api;
    const next = queue.shift() ?? queue.at(-1) ?? { status: 200, body: {} };
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  fn.calls = calls;
  return fn;
}

test("oauth2: mints token (Basic client creds, form grant) and sends Bearer", async () => {
  const f = mockOauthFetch({
    token: [{ body: { access_token: "tok-1", expires_in: 3600 } }],
    api: [{ body: { ok: 1 } }],
  });
  const r = await fetchSource(oauthSrc(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { ok: 1 });

  const tokenCall = f.calls.token[0];
  assert.equal(tokenCall.init.method, "POST");
  assert.equal(tokenCall.init.headers.authorization, `Basic ${btoa("my-client:my-secret")}`);
  assert.equal(tokenCall.init.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(tokenCall.init.body, "grant_type=client_credentials");

  const apiCall = f.calls.api[0];
  assert.equal(apiCall.init.headers.authorization, "Bearer tok-1");
});

test("oauth2: token is cached across calls (one token fetch)", async () => {
  const f = mockOauthFetch({
    token: [{ body: { access_token: "tok-1", expires_in: 3600 } }],
    api: [{ body: { n: 1 } }, { body: { n: 2 } }],
  });
  const cache = createMemoryCache();
  const deps = { fetch: f, sleep: noSleep, cache };
  const r1 = await fetchSource(oauthSrc(), req(), {}, deps);
  const r2 = await fetchSource(oauthSrc(), req(), {}, deps);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(f.calls.token.length, 1); // second call reused the cached token
  assert.equal(f.calls.api.length, 2); // req() is not cacheable (cacheEnabled:false)
});

test("oauth2: 401 forces ONE token refresh and re-fires the request", async () => {
  const f = mockOauthFetch({
    token: [
      { body: { access_token: "stale", expires_in: 3600 } },
      { body: { access_token: "fresh", expires_in: 3600 } },
    ],
    api: [{ status: 401 }, { body: { ok: 1 } }],
  });
  const r = await fetchSource(oauthSrc(), req(), {}, { fetch: f, sleep: noSleep, cache: createMemoryCache() });
  assert.equal(r.ok, true);
  assert.equal(f.calls.token.length, 2);
  assert.equal(f.calls.api.length, 2);
  assert.equal(f.calls.api[1].init.headers.authorization, "Bearer fresh");
});

test("oauth2: 401 refresh works for non-idempotent POST too, but only once", async () => {
  const f = mockOauthFetch({
    token: [
      { body: { access_token: "t1", expires_in: 3600 } },
      { body: { access_token: "t2", expires_in: 3600 } },
    ],
    api: [{ status: 401 }, { status: 401 }],
  });
  const r = await fetchSource(
    oauthSrc(),
    req({ method: "POST", bodyTemplate: '{"a":1}' }),
    {},
    { fetch: f, sleep: noSleep },
  );
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.equal(f.calls.api.length, 2); // 1 try + exactly 1 auth-refresh re-fire
  assert.equal(f.calls.token.length, 2);
});

test("oauth2: token endpoint failure / bad payload is graceful", async () => {
  const down = mockOauthFetch({ token: [{ status: 500 }] });
  const r1 = await fetchSource(oauthSrc(), req(), {}, { fetch: down, sleep: noSleep });
  assert.equal(r1.ok, false);
  assert.match(r1.error, /token endpoint responded 500/);
  assert.equal(down.calls.api.length, 0); // never hit the API without a token

  const noTok = mockOauthFetch({ token: [{ body: { nope: true } }] });
  const r2 = await fetchSource(oauthSrc(), req(), {}, { fetch: noTok, sleep: noSleep });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /no access_token/);

  const missing = await fetchSource(oauthSrc({ secret: null }), req(), {}, { fetch: down, sleep: noSleep });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /missing its token URL or client credentials/);
});

test("oauth2: token endpoint redirect is NOT followed (client creds stay put)", async () => {
  const f = mockOauthFetch({ token: [{ status: 302 }] });
  const r = await fetchSource(oauthSrc(), req(), {}, { fetch: f, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.match(r.error, /token endpoint responded 302/);
  assert.equal(f.calls.token.length, 1);
  assert.equal(f.calls.token[0].init.redirect, "manual");
  assert.equal(f.calls.api.length, 0);
});
