import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Regression for "surface mint failures to the PM user": when mint-on-deploy
// fails, the deploy still succeeds but the response carries `mintWarning: true`,
// and the form shows a localized `sites.deploy.mintWarning` notice. Guards the
// wiring at the source level (the route can't be imported under Node — it pulls
// the Cloudflare context) plus i18n parity for the new key.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("deploy route flags mint failure and returns mintWarning", () => {
  const src = read("src/app/api/sites/[id]/deploy/route.ts");
  // The catch block of the mint attempt records the failure.
  assert.match(src, /mintFailed\s*=\s*true/, "mint catch must set mintFailed");
  // The success response includes mintWarning only when minting failed.
  assert.match(
    src,
    /mintFailed\s*\?\s*\{\s*mintWarning:\s*true\s*\}/,
    "response must conditionally include mintWarning",
  );
});

test("deploy form reads mintWarning and renders the alert", () => {
  const src = read("src/app/(app)/sites/deploy-form.tsx");
  assert.match(src, /data\.mintWarning\s*===\s*true/, "form must read mintWarning from response");
  assert.match(src, /t\("mintWarning"\)/, "form must render the mintWarning string");
});

// Same treatment for the per-Site DECRYPT failure path: a stored key that can't
// be decrypted (bad/rotated SITE_SECRET_KEY, corrupt blob) used to only
// console.warn; now the deploy returns `keyWarning: true` and the form shows a
// localized `sites.deploy.keyWarning` notice. Graceful degrade is unchanged.
test("deploy route flags decrypt degrade and returns keyWarning", () => {
  const src = read("src/app/api/sites/[id]/deploy/route.ts");
  // The success response includes keyWarning only when the key was degraded.
  assert.match(
    src,
    /degraded\s*\?\s*\{\s*keyWarning:\s*true\s*\}/,
    "response must conditionally include keyWarning",
  );
});

test("deploy form reads keyWarning and renders the alert", () => {
  const src = read("src/app/(app)/sites/deploy-form.tsx");
  assert.match(src, /data\.keyWarning\s*===\s*true/, "form must read keyWarning from response");
  assert.match(src, /t\("keyWarning"\)/, "form must render the keyWarning string");
});

for (const locale of ["en", "fi", "et"]) {
  test(`${locale} has a non-empty sites.deploy.mintWarning`, () => {
    const msgs = JSON.parse(read(`messages/${locale}.json`));
    const v = msgs?.sites?.deploy?.mintWarning;
    assert.equal(typeof v, "string", `${locale}: missing sites.deploy.mintWarning`);
    assert.ok(v.trim().length > 0, `${locale}: empty sites.deploy.mintWarning`);
  });

  test(`${locale} has a non-empty sites.deploy.keyWarning`, () => {
    const msgs = JSON.parse(read(`messages/${locale}.json`));
    const v = msgs?.sites?.deploy?.keyWarning;
    assert.equal(typeof v, "string", `${locale}: missing sites.deploy.keyWarning`);
    assert.ok(v.trim().length > 0, `${locale}: empty sites.deploy.keyWarning`);
  });
}
