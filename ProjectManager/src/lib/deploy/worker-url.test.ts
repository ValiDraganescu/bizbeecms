import test from "node:test";
import assert from "node:assert/strict";
import { cmsWorkerUrl } from "./worker-url.ts";
import { WORKERS_DEV_SUFFIX } from "../config/hosts.ts";

test("cmsWorkerUrl builds the worker's workers.dev URL", async () => {
  assert.equal(
    await cmsWorkerUrl("bizbeecms-cms-acme"),
    `https://bizbeecms-cms-acme${WORKERS_DEV_SUFFIX}`,
  );
});

test("cmsWorkerUrl returns null for an empty worker name", async () => {
  assert.equal(await cmsWorkerUrl(""), null);
});
