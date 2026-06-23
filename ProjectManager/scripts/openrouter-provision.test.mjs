/**
 * Tests for the OpenRouter provisioning client (mintKey/deleteKey).
 * Dep-free node --test; imports the REAL .ts via native type-stripping.
 * Drives a FAKE fetch and asserts request shape + parsing — no live key, no network.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { mintKey, deleteKey, OPENROUTER_KEYS_URL } from "../src/lib/openrouter/provision.ts";

/** Fake fetch: records calls, returns a canned Response-like object. */
function fakeFetch(responder) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse(status, obj) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return obj;
    },
    async text() {
      return JSON.stringify(obj);
    },
  };
}

test("mintKey POSTs name+limit with Bearer auth and returns {key, hash}", async () => {
  const f = fakeFetch(() =>
    jsonResponse(200, { key: "sk-or-v1-minted", data: { hash: "h-123", name: "acme" } }),
  );
  const out = await mintKey("prov-key", { name: "acme", limit: 25 }, f);

  assert.deepEqual(out, { key: "sk-or-v1-minted", hash: "h-123" });
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.equal(url, OPENROUTER_KEYS_URL);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer prov-key");
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), { name: "acme", limit: 25 });
});

test("mintKey omits limit when null/undefined", async () => {
  const f = fakeFetch(() => jsonResponse(200, { key: "k", data: { hash: "h" } }));
  await mintKey("prov", { name: "n", limit: null }, f);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { name: "n" });

  const f2 = fakeFetch(() => jsonResponse(200, { key: "k", data: { hash: "h" } }));
  await mintKey("prov", { name: "n" }, f2);
  assert.deepEqual(JSON.parse(f2.calls[0].init.body), { name: "n" });
});

test("mintKey throws on non-2xx", async () => {
  const f = fakeFetch(() => jsonResponse(403, { error: "forbidden" }));
  await assert.rejects(() => mintKey("prov", { name: "n" }, f), /403/);
});

test("mintKey throws when response is missing key or hash", async () => {
  const noHash = fakeFetch(() => jsonResponse(200, { key: "k", data: {} }));
  await assert.rejects(() => mintKey("prov", { name: "n" }, noHash), /missing key\/hash/);

  const noKey = fakeFetch(() => jsonResponse(200, { data: { hash: "h" } }));
  await assert.rejects(() => mintKey("prov", { name: "n" }, noKey), /missing key\/hash/);
});

test("mintKey throws without a provisioning key (no fetch call)", async () => {
  const f = fakeFetch(() => jsonResponse(200, {}));
  await assert.rejects(() => mintKey("", { name: "n" }, f), /missing provisioning key/);
  assert.equal(f.calls.length, 0);
});

test("deleteKey DELETEs /keys/:hash with Bearer auth", async () => {
  const f = fakeFetch(() => jsonResponse(200, { ok: true }));
  await deleteKey("prov-key", "h-abc", f);

  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.equal(url, `${OPENROUTER_KEYS_URL}/h-abc`);
  assert.equal(init.method, "DELETE");
  assert.equal(init.headers.Authorization, "Bearer prov-key");
});

test("deleteKey URL-encodes the hash", async () => {
  const f = fakeFetch(() => jsonResponse(200, {}));
  await deleteKey("prov", "a/b c", f);
  assert.equal(f.calls[0].url, `${OPENROUTER_KEYS_URL}/a%2Fb%20c`);
});

test("deleteKey throws on non-2xx", async () => {
  const f = fakeFetch(() => jsonResponse(404, { error: "not found" }));
  await assert.rejects(() => deleteKey("prov", "h", f), /404/);
});

test("deleteKey throws without provisioning key or hash (no fetch call)", async () => {
  const f = fakeFetch(() => jsonResponse(200, {}));
  await assert.rejects(() => deleteKey("", "h", f), /missing provisioning key/);
  await assert.rejects(() => deleteKey("prov", "", f), /missing key hash/);
  assert.equal(f.calls.length, 0);
});
