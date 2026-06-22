/**
 * Dep-free unit tests for the PURE API-key primitives (cms-mcp Slice 2).
 * Run: node --test scripts/api-key-core.test.mjs
 *
 * The store + guard are CF-coupled (import @/db / the Db port) so they're not
 * node-loadable; the crypto + parsing logic is pure and lives in api-key-core.ts.
 * Project convention: import the .ts directly via Node type-stripping (no @/).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKey,
  keyPrefix,
  hashKey,
  verifyKey,
  timingSafeEqualHex,
  parseBearer,
  looksLikeKey,
} from "../src/lib/auth/api-key-core.ts";

test("generateKey: bzb_-prefixed, unique, base64url body", () => {
  const a = generateKey();
  const b = generateKey();
  assert.ok(a.startsWith("bzb_"));
  assert.notEqual(a, b, "two keys must differ");
  // base64url charset only after the prefix
  assert.match(a.slice(4), /^[A-Za-z0-9_-]+$/);
  assert.ok(a.length > 20, "should carry real entropy");
});

test("keyPrefix: leading public segment, not the whole secret", () => {
  const key = generateKey();
  const p = keyPrefix(key);
  assert.ok(p.startsWith("bzb_"));
  assert.ok(p.length < key.length, "prefix must be shorter than the key");
  assert.ok(key.startsWith(p));
});

test("hashKey: 64-char hex SHA-256, deterministic, differs per key", async () => {
  const key = generateKey();
  const h1 = await hashKey(key);
  const h2 = await hashKey(key);
  assert.equal(h1, h2, "same key → same hash");
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.notEqual(await hashKey(generateKey()), h1, "different key → different hash");
});

test("verifyKey: true only for the matching plaintext", async () => {
  const key = generateKey();
  const stored = await hashKey(key);
  assert.equal(await verifyKey(key, stored), true);
  assert.equal(await verifyKey(generateKey(), stored), false);
  assert.equal(await verifyKey("", stored), false);
  assert.equal(await verifyKey(key, ""), false);
});

test("timingSafeEqualHex: length mismatch and char mismatch both false", () => {
  assert.equal(timingSafeEqualHex("aa", "aa"), true);
  assert.equal(timingSafeEqualHex("aa", "ab"), false);
  assert.equal(timingSafeEqualHex("aa", "aaa"), false);
});

test("parseBearer: extracts token, tolerant of case/whitespace", () => {
  assert.equal(parseBearer("Bearer bzb_abc"), "bzb_abc");
  assert.equal(parseBearer("bearer   bzb_abc  "), "bzb_abc");
  assert.equal(parseBearer("BEARER bzb_abc"), "bzb_abc");
  assert.equal(parseBearer(null), null);
  assert.equal(parseBearer(""), null);
  assert.equal(parseBearer("Basic xyz"), null);
  assert.equal(parseBearer("Bearer "), null, "empty credential → null");
});

test("looksLikeKey: gate before a DB round-trip", () => {
  assert.equal(looksLikeKey(generateKey()), true);
  assert.equal(looksLikeKey("bzb_"), false, "prefix alone is too short");
  assert.equal(looksLikeKey("nope_abcdefghij"), false);
  assert.equal(looksLikeKey(null), false);
  assert.equal(looksLikeKey(undefined), false);
});

test("round-trip: generate → hash → verify holds, prefix never authenticates", async () => {
  const key = generateKey();
  const stored = await hashKey(key);
  assert.equal(await verifyKey(key, stored), true);
  // The stored display prefix must NOT verify as the key.
  assert.equal(await verifyKey(keyPrefix(key), stored), false);
});
