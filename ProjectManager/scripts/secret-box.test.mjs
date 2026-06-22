import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../src/lib/crypto/secret-box.ts";

// Fixed 32-byte test key (base64) — NOT the env secret; deterministic for tests.
const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");

test("round-trip: decrypt(encrypt(x)) === x", async () => {
  const plain = "sk-or-v1-abc123-some-openrouter-key";
  const blob = await encryptSecret(plain, KEY);
  assert.equal(await decryptSecret(blob, KEY), plain);
});

test("two encryptions of the same plaintext differ (random IV)", async () => {
  const a = await encryptSecret("same", KEY);
  const b = await encryptSecret("same", KEY);
  assert.notEqual(a, b);
});

test("tampered blob throws (GCM auth)", async () => {
  const blob = await encryptSecret("secret", KEY);
  const bytes = Buffer.from(blob, "base64");
  bytes[bytes.length - 1] ^= 0xff; // flip a ciphertext/tag byte
  const tampered = bytes.toString("base64");
  await assert.rejects(() => decryptSecret(tampered, KEY));
});

test("wrong key throws", async () => {
  const blob = await encryptSecret("secret", KEY);
  await assert.rejects(() => decryptSecret(blob, OTHER_KEY));
});

test("too-short blob throws", async () => {
  await assert.rejects(() => decryptSecret(Buffer.alloc(4).toString("base64"), KEY));
});
