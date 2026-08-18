import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDeployHostnames, shouldUpgradeToHttpDcv } from "./dcv-core.ts";

test("parseDeployHostnames: normalizes, drops junk + dupes, never throws", () => {
  assert.deepEqual(
    parseDeployHostnames([" WWW.Example.com ", "www.example.com", "not a host", 42, null, "apex.io"]),
    ["www.example.com", "apex.io"],
  );
  assert.deepEqual(parseDeployHostnames(undefined), []);
  assert.deepEqual(parseDeployHostnames("www.example.com"), []);
});

test("upgrades an active TXT-validated hostname to http", () => {
  assert.equal(
    shouldUpgradeToHttpDcv({ status: "active", ssl: { status: "active", method: "txt", type: "dv" } }),
    true,
  );
});

test("upgrades when a renewal is stuck pending on stale TXT tokens", () => {
  assert.equal(
    shouldUpgradeToHttpDcv({ status: "active", ssl: { status: "pending_validation", method: "txt" } }),
    true,
  );
});

test("leaves already-http hostnames alone (idempotent)", () => {
  assert.equal(
    shouldUpgradeToHttpDcv({ status: "active", ssl: { status: "active", method: "http" } }),
    false,
  );
  assert.equal(
    shouldUpgradeToHttpDcv({ status: "active", ssl: { status: "active", method: "HTTP" } }),
    false,
  );
});

test("does not touch hostnames whose DNS isn't on our edge yet", () => {
  // pending → customer hasn't added the CNAME; HTTP DCV would fail and we'd
  // lose the TXT path they may be mid-way through.
  assert.equal(
    shouldUpgradeToHttpDcv({ status: "pending", ssl: { status: "pending_validation", method: "txt" } }),
    false,
  );
  assert.equal(shouldUpgradeToHttpDcv({ status: "moved", ssl: { status: "active", method: "txt" } }), false);
  assert.equal(shouldUpgradeToHttpDcv(null), false);
  assert.equal(shouldUpgradeToHttpDcv({}), false);
});

test("never switches a wildcard cert off DNS validation", () => {
  assert.equal(
    shouldUpgradeToHttpDcv({ status: "active", ssl: { status: "active", method: "txt", wildcard: true } }),
    false,
  );
});
