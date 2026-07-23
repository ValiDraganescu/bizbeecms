import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDeleteSiteBody, teardownOk } from "./delete-core.ts";

test("derives every resource name from the slug", () => {
  const parsed = parseDeleteSiteBody({ slug: "acme" });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.value, {
    resourceSlug: "acme",
    workerName: "bizbeecms-cms-acme",
    dbName: "bizbeecms-cms-acme",
    bucketName: "bizbeecms-cms-media-acme",
    hostnames: [],
  });
});

test("a deployed workerName wins over a renamed slug", () => {
  // Site deployed as `acme`, then renamed to `acme-new` in PM: the CF
  // resources still carry the deploy-time names and must be the ones deleted.
  const parsed = parseDeleteSiteBody({
    slug: "acme-new",
    workerName: "bizbeecms-cms-acme",
  });
  assert.ok(parsed.ok);
  assert.equal(parsed.value.resourceSlug, "acme");
  assert.equal(parsed.value.workerName, "bizbeecms-cms-acme");
  assert.equal(parsed.value.dbName, "bizbeecms-cms-acme");
  assert.equal(parsed.value.bucketName, "bizbeecms-cms-media-acme");
});

test("normalises and dedupes hostnames", () => {
  const parsed = parseDeleteSiteBody({
    slug: "acme",
    hostnames: ["WWW.Acme.com ", "www.acme.com", "acme.com"],
  });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.value.hostnames, ["www.acme.com", "acme.com"]);
});

test("rejects a bad slug", () => {
  for (const slug of ["", "Acme", "acme_1", "-acme", "a..b", "a b"]) {
    assert.deepEqual(parseDeleteSiteBody({ slug }), {
      ok: false,
      error: "badRequest",
    });
  }
});

test("rejects a workerName that isn't a per-Site CMS Worker", () => {
  // Never allow deleting arbitrary Workers (the PM, router, deployer itself).
  for (const workerName of [
    "bizbeecms-pm",
    "bizbeecms-deployer",
    "router",
    "bizbeecms-cms-",
    "bizbeecms-cms-UPPER",
  ]) {
    assert.deepEqual(parseDeleteSiteBody({ slug: "acme", workerName }), {
      ok: false,
      error: "badRequest",
    });
  }
});

test("an empty workerName falls back to the slug", () => {
  const parsed = parseDeleteSiteBody({ slug: "acme", workerName: "" });
  assert.ok(parsed.ok);
  assert.equal(parsed.value.resourceSlug, "acme");
});

test("rejects a malformed hostname", () => {
  assert.deepEqual(
    parseDeleteSiteBody({ slug: "acme", hostnames: ["https://acme.com"] }),
    { ok: false, error: "badRequest" },
  );
  assert.deepEqual(parseDeleteSiteBody({ slug: "acme", hostnames: [""] }), {
    ok: false,
    error: "badRequest",
  });
});

test("teardownOk passes only ok/skipped steps", () => {
  assert.equal(teardownOk({ worker: "ok", domains: "skipped" }), true);
  assert.equal(teardownOk({ worker: "ok", r2: "partial" }), false);
  assert.equal(teardownOk({ worker: "failed: HTTP 500" }), false);
  assert.equal(teardownOk({}), true);
});
