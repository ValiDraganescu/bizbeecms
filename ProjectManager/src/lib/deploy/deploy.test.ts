import assert from "node:assert/strict";
import { test } from "node:test";

// These imports are kept to the dependency-free deploy modules (no drizzle, no
// @opennextjs/cloudflare, no env), so the suite runs under `node --test` with
// type-stripping and without Cloudflare auth or a D1 binding. Relative paths
// (not the `@/` alias) so node's resolver finds them.
import {
  CMS_WORKER_PREFIX,
  MAX_WORKER_NAME_LEN,
  isValidWorkerName,
  workerNameForSlug,
} from "./worker-name.ts";

test("workerNameForSlug prefixes the slug and is a valid Worker name", () => {
  const name = workerNameForSlug("acme-shop");
  assert.equal(name, `${CMS_WORKER_PREFIX}-acme-shop`);
  assert.ok(isValidWorkerName(name));
});

test("workerNameForSlug clamps to the Cloudflare length limit", () => {
  const longSlug = "a".repeat(100);
  const name = workerNameForSlug(longSlug);
  assert.ok(name.length <= MAX_WORKER_NAME_LEN);
  assert.ok(isValidWorkerName(name), `expected valid worker name, got "${name}"`);
});

test("workerNameForSlug strips a trailing hyphen left by clamping", () => {
  // Craft a slug whose clamp boundary lands on a hyphen.
  const slug = `${"x".repeat(MAX_WORKER_NAME_LEN - CMS_WORKER_PREFIX.length - 1)}-y`;
  const name = workerNameForSlug(slug);
  assert.ok(!name.endsWith("-"));
  assert.ok(isValidWorkerName(name));
});

test("isValidWorkerName rejects bad names", () => {
  assert.ok(!isValidWorkerName("-leading"));
  assert.ok(!isValidWorkerName("trailing-"));
  assert.ok(!isValidWorkerName("UpperCase"));
  assert.ok(!isValidWorkerName("has space"));
  assert.ok(!isValidWorkerName(""));
  assert.ok(isValidWorkerName("a"));
  assert.ok(isValidWorkerName("bizbeecms-cms-foo"));
});
