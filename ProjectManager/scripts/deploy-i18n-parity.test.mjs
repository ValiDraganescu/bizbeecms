import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Guards the deploy error-path i18n: every error key the Deploy UI can show
// must have a `sites.deploy.errors.<key>` string in EN/FI/ET — and no extras.
// Keys are read from source so a newly-added DeployErrorKey/gate error without
// a catalog string fails this test instead of shipping a missing translation.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Pull the string-literal members out of a `type X = | "a" | "b" ...;` block.
function unionKeys(file, typeName) {
  const src = readFileSync(join(root, file), "utf8");
  const m = src.match(new RegExp(`type\\s+${typeName}\\s*=([^;]*);`));
  assert.ok(m, `${file}: could not find type ${typeName}`);
  return new Set([...m[1].matchAll(/"([a-zA-Z]+)"/g)].map((x) => x[1]));
}

// DeployErrorKey union (engine) ∪ the gate-only errors the deploy route's
// DeployError type adds on top of it. (Auth/CRUD moved from server actions to
// REST route handlers — server actions 500 on OpenNext/Workers.)
const engineKeys = unionKeys("src/lib/deploy/deploy.ts", "DeployErrorKey");
const gateExtra = unionKeys(
  "src/app/api/sites/[id]/deploy/route.ts",
  "DeployError",
);

const expected = new Set([...engineKeys, ...gateExtra]);

test("sanity: extracted the known deploy error keys", () => {
  for (const k of ["notFound", "notConfigured", "uploadFailed", "notAllowed", "bundleMissing"]) {
    assert.ok(expected.has(k), `expected to extract "${k}" from source`);
  }
});

for (const locale of ["en", "fi", "et"]) {
  test(`${locale} catalog has exactly the deploy error keys`, () => {
    const msgs = JSON.parse(readFileSync(join(root, `messages/${locale}.json`), "utf8"));
    const errs = msgs?.sites?.deploy?.errors ?? {};
    const have = new Set(Object.keys(errs));
    for (const k of expected) {
      assert.ok(have.has(k), `${locale}: missing sites.deploy.errors.${k}`);
      assert.ok(String(errs[k]).trim().length > 0, `${locale}: empty sites.deploy.errors.${k}`);
    }
    for (const k of have) {
      assert.ok(expected.has(k), `${locale}: stale sites.deploy.errors.${k} (no source key)`);
    }
  });
}
