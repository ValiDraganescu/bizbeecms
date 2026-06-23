import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldMintOnDeploy } from "../src/lib/site/mint-on-deploy.ts";

test("mints when enabled and no key yet", () => {
  assert.equal(shouldMintOnDeploy(true, null), true);
  assert.equal(shouldMintOnDeploy(true, undefined), true);
  assert.equal(shouldMintOnDeploy(true, ""), true);
});

test("does NOT mint when a key already exists (idempotent)", () => {
  assert.equal(shouldMintOnDeploy(true, "hash-abc"), false);
});

test("does NOT mint when minting is disabled", () => {
  assert.equal(shouldMintOnDeploy(false, null), false);
  assert.equal(shouldMintOnDeploy(false, "hash-abc"), false);
});

test("only literal true enables minting", () => {
  // guards against truthy non-booleans sneaking through
  assert.equal(shouldMintOnDeploy(/** @type {any} */ (1), null), false);
  assert.equal(shouldMintOnDeploy(/** @type {any} */ ("yes"), null), false);
});
