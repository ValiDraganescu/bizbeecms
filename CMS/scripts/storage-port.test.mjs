/**
 * Tests for the `Storage` port + `CfStorage` adapter (binding-adapters subgoal).
 * Dep-free node --test; imports the REAL .ts adapter via native type-stripping
 * (the `getStorage` factory imports `@opennextjs/cloudflare` but only invokes it
 * when called, so importing the module under node is fine).
 *
 * We drive the real `CfStorage` against an in-memory fake R2 bucket and assert
 * what R2 actually RECEIVES — not "was put called". The single behavior the
 * adapter owns, and the thing that would break callers if it regressed, is the
 * `{ contentType }` → R2 `httpMetadata` translation on `put`, plus 1:1
 * pass-through of `get`/`delete`. That's the seam earning its keep.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { CfStorage } from "../src/lib/ports/storage.ts";

/** In-memory fake R2Bucket: stores objects keyed by `key`, records put options. */
function fakeBucket() {
  const store = new Map();
  return {
    store,
    async put(key, bytes, options) {
      store.set(key, { bytes, options });
    },
    async get(key) {
      const o = store.get(key);
      return o ? { body: o.bytes } : null;
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

test("put translates { contentType } into R2 httpMetadata and stores the bytes", async () => {
  const bucket = fakeBucket();
  const storage = new CfStorage(bucket);
  const bytes = new ArrayBuffer(8);

  await storage.put("assets/logo.png", bytes, { contentType: "image/png" });

  const stored = bucket.store.get("assets/logo.png");
  assert.equal(stored.bytes, bytes);
  // The real contract: contentType lands under httpMetadata, not at the top level.
  assert.deepEqual(stored.options, { httpMetadata: { contentType: "image/png" } });
});

test("put with no options still passes httpMetadata (contentType undefined)", async () => {
  const bucket = fakeBucket();
  const storage = new CfStorage(bucket);
  await storage.put("k", new ArrayBuffer(1));
  assert.deepEqual(bucket.store.get("k").options, {
    httpMetadata: { contentType: undefined },
  });
});

test("get returns the R2 object body, or null when absent", async () => {
  const bucket = fakeBucket();
  const storage = new CfStorage(bucket);
  const bytes = new ArrayBuffer(4);
  await storage.put("present", bytes);

  const hit = await storage.get("present");
  assert.equal(hit.body, bytes);
  assert.equal(await storage.get("missing"), null);
});

test("delete removes the object from storage", async () => {
  const bucket = fakeBucket();
  const storage = new CfStorage(bucket);
  await storage.put("doomed", new ArrayBuffer(1));
  assert.ok(bucket.store.has("doomed"));

  await storage.delete("doomed");
  assert.equal(bucket.store.has("doomed"), false);
});
