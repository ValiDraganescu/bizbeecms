import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCmsTag,
  deployedVersionFromCallback,
  displayCmsVersion,
} from "./cms-version.ts";

test("parseCmsTag extracts x.y.z from a cms-v tag", () => {
  assert.equal(parseCmsTag("cms-v0.6.0"), "0.6.0");
  assert.equal(parseCmsTag("cms-v12.3.45"), "12.3.45");
  assert.equal(parseCmsTag("  cms-v1.0.0  "), "1.0.0");
});

test("parseCmsTag rejects non-cms tags and partial versions", () => {
  assert.equal(parseCmsTag("v0.6.0"), null);
  assert.equal(parseCmsTag("cms-v0.6"), null);
  assert.equal(parseCmsTag("main"), null);
  assert.equal(parseCmsTag(""), null);
});

test("deployedVersionFromCallback records a valid ref verbatim", () => {
  assert.equal(deployedVersionFromCallback("cms-v0.6.0"), "cms-v0.6.0");
  assert.equal(deployedVersionFromCallback("main"), "main");
  assert.equal(deployedVersionFromCallback("  cms-v1.2.3 "), "cms-v1.2.3");
});

test("deployedVersionFromCallback returns null for absent/empty/non-string", () => {
  assert.equal(deployedVersionFromCallback(undefined), null);
  assert.equal(deployedVersionFromCallback(null), null);
  assert.equal(deployedVersionFromCallback(""), null);
  assert.equal(deployedVersionFromCallback("   "), null);
  assert.equal(deployedVersionFromCallback(123), null);
});

test("deployedVersionFromCallback rejects shell-unsafe refs", () => {
  assert.equal(deployedVersionFromCallback("foo; rm -rf /"), null);
  assert.equal(deployedVersionFromCallback("a b"), null);
  assert.equal(deployedVersionFromCallback("$(whoami)"), null);
});

test("deployedVersionFromCallback caps length", () => {
  const long = "cms-v" + "1".repeat(200);
  const out = deployedVersionFromCallback(long);
  assert.equal(out?.length, 80);
});

test("displayCmsVersion shows x.y.z for a tag, verbatim otherwise, null for empty", () => {
  assert.equal(displayCmsVersion("cms-v0.6.0"), "0.6.0");
  assert.equal(displayCmsVersion("main"), "main");
  assert.equal(displayCmsVersion(null), null);
  assert.equal(displayCmsVersion(undefined), null);
  assert.equal(displayCmsVersion(""), null);
});
