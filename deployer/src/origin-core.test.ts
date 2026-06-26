import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseAppOrigin } from "./origin-core.ts";

const FALLBACK = "https://bizbeecms-cms-acme.vali-draganescu88.workers.dev";

test("prefers a valid https custom domain", () => {
  assert.equal(chooseAppOrigin("https://www.acme.com", FALLBACK), "https://www.acme.com");
});

test("strips a trailing slash from the custom domain", () => {
  assert.equal(chooseAppOrigin("https://acme.com/", FALLBACK), "https://acme.com");
});

test("trims surrounding whitespace", () => {
  assert.equal(chooseAppOrigin("  https://acme.com  ", FALLBACK), "https://acme.com");
});

test("falls back when no domain passed", () => {
  assert.equal(chooseAppOrigin(undefined, FALLBACK), FALLBACK);
  assert.equal(chooseAppOrigin(null, FALLBACK), FALLBACK);
  assert.equal(chooseAppOrigin("", FALLBACK), FALLBACK);
});

test("rejects non-https schemes", () => {
  assert.equal(chooseAppOrigin("http://acme.com", FALLBACK), FALLBACK);
  assert.equal(chooseAppOrigin("ftp://acme.com", FALLBACK), FALLBACK);
});

test("rejects a URL with a path/query (no breaking out of origin)", () => {
  assert.equal(chooseAppOrigin("https://acme.com/evil?x=1", FALLBACK), FALLBACK);
});

test("rejects a malformed hostname", () => {
  assert.equal(chooseAppOrigin("https://not a host", FALLBACK), FALLBACK);
  assert.equal(chooseAppOrigin("https://localhost", FALLBACK), FALLBACK);
  assert.equal(chooseAppOrigin("https://", FALLBACK), FALLBACK);
});

test("rejects junk", () => {
  assert.equal(chooseAppOrigin("javascript:alert(1)", FALLBACK), FALLBACK);
});
