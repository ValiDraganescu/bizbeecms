/**
 * Dep-free unit tests for external-data-sources Slice-7 cache purging
 * (src/lib/data-sources/purge.ts — pure version counters) + its integration
 * with the fetch engine's cacheVersion (a bump must invalidate exactly its
 * scope; untouched scopes keep serving cached).
 * Run: node --test scripts/data-source-purge.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyCacheVersions,
  normalizeCacheVersions,
  cacheVersionFor,
  bumpGlobal,
  bumpSource,
  bumpRequest,
  pruneCounters,
} from "../src/lib/data-sources/purge.ts";
import { createMemoryCache, fetchSource } from "../src/lib/data-sources/fetch.ts";

/* ------------------------------------------------------------- pure logic */

test("normalizeCacheVersions: garbage → zeroed counters", () => {
  for (const raw of [null, undefined, "x", 42, [], { global: "9" }]) {
    assert.deepEqual(normalizeCacheVersions(raw), emptyCacheVersions());
  }
});

test("normalizeCacheVersions: keeps valid counters, drops junk + zeros", () => {
  const v = normalizeCacheVersions({
    global: 3.7,
    sources: { a: 2, b: 0, c: "nope", d: -1 },
    requests: { r: 1 },
  });
  assert.deepEqual(v, { global: 3, sources: { a: 2 }, requests: { r: 1 } });
});

test("cacheVersionFor composes global.source.request", () => {
  const v = { global: 2, sources: { s1: 1 }, requests: { r1: 4 } };
  assert.equal(cacheVersionFor(v, "s1", "r1"), "2.1.4");
  assert.equal(cacheVersionFor(v, "s2", "r2"), "2.0.0"); // unknown = 0
});

test("bumps change exactly their scope's composed version", () => {
  const v0 = emptyCacheVersions();
  const before = cacheVersionFor(v0, "s1", "r1");

  const g = bumpGlobal(v0);
  assert.notEqual(cacheVersionFor(g, "s1", "r1"), before);
  assert.notEqual(cacheVersionFor(g, "s2", "r2"), cacheVersionFor(v0, "s2", "r2"));

  const s = bumpSource(v0, "s1");
  assert.notEqual(cacheVersionFor(s, "s1", "r1"), before);
  assert.equal(cacheVersionFor(s, "s2", "r2"), cacheVersionFor(v0, "s2", "r2"));

  const r = bumpRequest(v0, "r1");
  assert.notEqual(cacheVersionFor(r, "s1", "r1"), before);
  assert.equal(cacheVersionFor(r, "s1", "r2"), cacheVersionFor(v0, "s1", "r2"));
});

test("bumps are immutable + monotonic", () => {
  const v0 = emptyCacheVersions();
  const v1 = bumpRequest(bumpSource(bumpGlobal(v0), "s1"), "r1");
  assert.deepEqual(v0, emptyCacheVersions()); // untouched
  assert.deepEqual(v1, { global: 1, sources: { s1: 1 }, requests: { r1: 1 } });
  assert.deepEqual(bumpGlobal(v1).global, 2);
});

test("pruneCounters drops exactly the deleted source/request keys", () => {
  const v = { global: 2, sources: { s1: 3, s2: 1 }, requests: { r1: 4, r2: 2, r3: 1 } };

  // Source delete with its cascading requests.
  const p = pruneCounters(v, { sourceId: "s1", requestIds: ["r1", "r2"] });
  assert.deepEqual(p, { global: 2, sources: { s2: 1 }, requests: { r3: 1 } });
  assert.deepEqual(v.sources, { s1: 3, s2: 1 }); // input untouched

  // Single request delete.
  assert.deepEqual(pruneCounters(v, { requestIds: ["r3"] }).requests, { r1: 4, r2: 2 });
});

test("pruneCounters returns the SAME object when nothing matches (skip write)", () => {
  const v = { global: 1, sources: { s1: 1 }, requests: { r1: 1 } };
  assert.equal(pruneCounters(v, { sourceId: "nope", requestIds: ["also-nope"] }), v);
  assert.equal(pruneCounters(v, {}), v);
});

/* ------------------------------------------- integration with fetchSource */

const src = { id: "s1", baseUrl: "https://api.example.com", authType: "none", authParam: null, secret: null };
const req = (id) => ({
  id,
  method: "GET",
  path: `/${id}`,
  query: {},
  bodyTemplate: null,
  cacheEnabled: true,
  cacheTtlSec: 60,
  retryable: false,
});

function countingFetch() {
  const calls = { n: 0 };
  const f = async () =>
    new Response(JSON.stringify({ n: ++calls.n }), { status: 200 });
  return { f, calls };
}

test("purge bump invalidates the right scope; untouched requests stay cached", async () => {
  const cache = createMemoryCache();
  const { f, calls } = countingFetch();
  let v = emptyCacheVersions();
  const deps = (requestId) => ({
    fetch: f,
    cache,
    cacheVersion: cacheVersionFor(v, src.id, requestId),
  });

  // Warm both requests, then confirm cache hits.
  await fetchSource(src, req("r1"), {}, deps("r1"));
  await fetchSource(src, req("r2"), {}, deps("r2"));
  assert.equal(calls.n, 2);
  assert.equal((await fetchSource(src, req("r1"), {}, deps("r1"))).cached, true);
  assert.equal((await fetchSource(src, req("r2"), {}, deps("r2"))).cached, true);
  assert.equal(calls.n, 2);

  // Purge r1 only → r1 refetches, r2 keeps serving cached.
  v = bumpRequest(v, "r1");
  assert.equal((await fetchSource(src, req("r1"), {}, deps("r1"))).cached, false);
  assert.equal((await fetchSource(src, req("r2"), {}, deps("r2"))).cached, true);
  assert.equal(calls.n, 3);

  // Global purge → everything refetches.
  v = bumpGlobal(v);
  assert.equal((await fetchSource(src, req("r1"), {}, deps("r1"))).cached, false);
  assert.equal((await fetchSource(src, req("r2"), {}, deps("r2"))).cached, false);
  assert.equal(calls.n, 5);
});
