import { test } from "node:test";
import assert from "node:assert/strict";
import { decideDeployOpenrouterField } from "../src/lib/site/deploy-openrouter-key.ts";

// Fake plaintext — never a real key; the helper takes an injected decrypt thunk.
const FAKE_PLAINTEXT = "sk-or-fake-test-key";
const FAKE_CIPHERTEXT = "ciphertext-blob";

test("present + decrypts → includes openrouterApiKey plaintext", () => {
  const r = decideDeployOpenrouterField(FAKE_CIPHERTEXT, () => FAKE_PLAINTEXT);
  assert.deepEqual(r.body, { openrouterApiKey: FAKE_PLAINTEXT });
  assert.equal(r.degraded, false);
});

test("null → omits the field, not degraded", () => {
  const r = decideDeployOpenrouterField(null, () => {
    throw new Error("should not be called");
  });
  assert.deepEqual(r.body, {});
  assert.equal(r.degraded, false);
});

test("undefined → omits the field, not degraded", () => {
  const r = decideDeployOpenrouterField(undefined, () => "x");
  assert.deepEqual(r.body, {});
  assert.equal(r.degraded, false);
});

test("empty string → treated as no key, omits, not degraded", () => {
  const r = decideDeployOpenrouterField("", () => "x");
  assert.deepEqual(r.body, {});
  assert.equal(r.degraded, false);
});

test("decrypt throws → omits the field AND flags degraded (deploy proceeds)", () => {
  const r = decideDeployOpenrouterField(FAKE_CIPHERTEXT, () => {
    throw new Error("bad/rotated key");
  });
  assert.deepEqual(r.body, {});
  assert.equal(r.degraded, true);
});

test("spread of body is safe to merge into the deploy POST body", () => {
  const base = { siteId: "s1", slug: "acme" };
  const ok = { ...base, ...decideDeployOpenrouterField(FAKE_CIPHERTEXT, () => FAKE_PLAINTEXT).body };
  assert.deepEqual(ok, { siteId: "s1", slug: "acme", openrouterApiKey: FAKE_PLAINTEXT });
  const omitted = { ...base, ...decideDeployOpenrouterField(null, () => "x").body };
  assert.deepEqual(omitted, { siteId: "s1", slug: "acme" });
});
