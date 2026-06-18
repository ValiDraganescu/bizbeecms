/**
 * Tests for the unified adapter factory `cfPorts` (binding-adapters subgoal).
 * Dep-free node --test; imports the REAL .ts (`getPorts` imports
 * `@opennextjs/cloudflare` but only invokes it when called, so importing under
 * node is fine — we test `cfPorts`, the binding-shaped seam).
 *
 * We drive the real `cfPorts` against fake bindings and assert it composes the
 * REAL CF adapters (not stubs) and preserves the contracts callers depend on:
 *   - returns a working drizzle `db` (a real query reaches the fake D1),
 *   - returns a `storage` whose put translates contentType → R2 httpMetadata,
 *   - `ai` is a working CfAi when AI is bound and `null` when it isn't,
 *   - throws when MEDIA is unbound (matches getStorage()).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { cfPorts } from "../src/lib/ports/index.ts";

/** Fake D1 that records prepared SQL; selects need .raw(), inserts use .run(). */
function fakeD1() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const rec = { sql, params: [] };
      calls.push(rec);
      const stmt = {
        bind(...params) {
          rec.params = params;
          return stmt;
        },
        async raw() {
          return [];
        },
        async run() {
          return { success: true };
        },
        async all() {
          return { results: [] };
        },
      };
      return stmt;
    },
  };
}

/** Fake R2: records put options, so we can prove the contentType translation. */
function fakeR2() {
  const puts = [];
  return {
    puts,
    async put(key, bytes, options) {
      puts.push({ key, bytes, options });
    },
    async get() {
      return null;
    },
    async delete() {},
  };
}

/** Fake env.AI: records the run() call. */
function fakeAi() {
  const calls = [];
  return {
    calls,
    async run(model, inputs, options) {
      calls.push({ model, inputs, options });
      return new ReadableStream();
    },
  };
}

test("cfPorts composes the real CF adapters from one env read", async () => {
  const MEDIA = fakeR2();
  const AI = fakeAi();

  const { storage, ai } = cfPorts({ DB: fakeD1(), MEDIA, AI });

  // storage is the real adapter: put translates contentType → R2 httpMetadata.
  await storage.put("k", new ArrayBuffer(4), { contentType: "image/png" });
  assert.equal(MEDIA.puts.length, 1);
  assert.deepEqual(MEDIA.puts[0].options, {
    httpMetadata: { contentType: "image/png" },
  });

  // ai is a working CfAi: chat() reaches the binding with streaming inputs.
  assert.ok(ai, "ai must be present when AI is bound");
  await ai.chat([{ role: "user", content: "hi" }], { model: "m" });
  assert.equal(AI.calls.length, 1);
  assert.equal(AI.calls[0].inputs.stream, true);
});

test("cfPorts.db is a real drizzle client (real query hits the fake D1)", async () => {
  const DB = fakeD1();
  const { db } = cfPorts({ DB, MEDIA: fakeR2(), AI: fakeAi() });
  // A select through drizzle's query API issues a prepared statement.
  await db.query.page.findFirst().catch(() => {});
  assert.ok(DB.calls.length > 0, "drizzle must have prepared SQL against D1");
  assert.match(DB.calls[0].sql, /page/i);
});

test("ai is null when the AI binding is absent (nullability preserved)", () => {
  const { ai } = cfPorts({ DB: fakeD1(), MEDIA: fakeR2() });
  assert.equal(ai, null);
});

test("cfPorts throws when MEDIA is unbound (matches getStorage)", () => {
  assert.throws(
    () => cfPorts({ DB: fakeD1(), AI: fakeAi() }),
    /MEDIA is not configured/,
  );
});
