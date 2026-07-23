import test from "node:test";
import assert from "node:assert/strict";
import { cmsWorkerUrl } from "./worker-url.ts";
import { WORKERS_DEV_SUFFIX } from "../config/hosts.ts";

test("cmsWorkerUrl builds the worker's workers.dev URL", () => {
  assert.equal(
    cmsWorkerUrl("bizbeecms-cms-acme"),
    `https://bizbeecms-cms-acme${WORKERS_DEV_SUFFIX}`,
  );
});

test("cmsWorkerUrl returns null for an empty worker name", () => {
  assert.equal(cmsWorkerUrl(""), null);
});

test("cmsWorkerUrl builds the URL under an injected account subdomain", () => {
  assert.equal(
    cmsWorkerUrl("bizbeecms-cms-acme", "some-account"),
    "https://bizbeecms-cms-acme.some-account.workers.dev",
  );
});

test("cmsWorkerUrl falls back to the compiled-in subdomain when the var is unset", () => {
  // A missing WORKERS_SUBDOMAIN must degrade to today's URL, never to
  // `https://name..workers.dev`.
  assert.equal(
    cmsWorkerUrl("bizbeecms-cms-acme", "  "),
    `https://bizbeecms-cms-acme${WORKERS_DEV_SUFFIX}`,
  );
});
