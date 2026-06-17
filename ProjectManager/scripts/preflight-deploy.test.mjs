import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonc, validateWranglerConfig, REQUIRED_COMPAT_FLAGS } from "./preflight-deploy.mjs";

test("parseJsonc strips // and /* */ comments", () => {
  const cfg = parseJsonc(`{
    // a line comment
    "name": "x", /* block */ "n": 1
  }`);
  assert.deepEqual(cfg, { name: "x", n: 1 });
});

const GOOD = {
  compatibility_flags: [...REQUIRED_COMPAT_FLAGS],
  d1_databases: [{ binding: "DB", database_name: "bizbeecms", database_id: "a1b2c3d4-0000-1111-2222-333344445555" }],
  kv_namespaces: [{ binding: "SESSIONS", id: "abcdef0123456789abcdef0123456789" }],
  vars: { APP_ORIGIN: "https://pm.example" },
};

test("good config passes with no errors/warnings", () => {
  const { errors, warnings } = validateWranglerConfig(GOOD);
  assert.equal(errors.length, 0, errors.join("; "));
  assert.equal(warnings.length, 0, warnings.join("; "));
});

test("placeholder zero-ids are flagged as errors", () => {
  const { errors } = validateWranglerConfig({
    ...GOOD,
    d1_databases: [{ binding: "DB", database_name: "bizbeecms", database_id: "00000000-0000-0000-0000-000000000000" }],
    kv_namespaces: [{ binding: "SESSIONS", id: "00000000000000000000000000000000" }],
  });
  assert.ok(errors.some((e) => e.includes("D1") && e.includes("placeholder")), "D1 placeholder not caught");
  assert.ok(errors.some((e) => e.includes("KV") && e.includes("placeholder")), "KV placeholder not caught");
});

test("missing compat flag is an error", () => {
  const { errors } = validateWranglerConfig({ ...GOOD, compatibility_flags: ["nodejs_compat"] });
  assert.ok(errors.some((e) => e.includes("global_fetch_strictly_public")));
});

test("missing APP_ORIGIN is a warning, not an error", () => {
  const { errors, warnings } = validateWranglerConfig({ ...GOOD, vars: {} });
  assert.equal(errors.length, 0);
  assert.ok(warnings.some((w) => w.includes("APP_ORIGIN")));
});
