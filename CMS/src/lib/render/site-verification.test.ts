import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildVerificationMeta,
  emptySiteVerification,
  isEmptyVerification,
  normalizeSiteVerification,
} from "./site-verification.ts";

test("empty is empty", () => {
  assert.equal(isEmptyVerification(emptySiteVerification()), true);
});

test("normalize keeps valid tokens, trims, drops extra keys", () => {
  const v = normalizeSiteVerification({
    google: "  abc-123_XY.z  ",
    bing: "0123456789ABCDEF",
    yandex: "tok",
    junk: "ignored",
  });
  assert.deepEqual(v, { google: "abc-123_XY.z", bing: "0123456789ABCDEF", yandex: "tok" });
});

test("normalize strips forbidden chars — no meta-attr injection", () => {
  // A pasted full tag or an injection attempt loses every quote/space/angle.
  const v = normalizeSiteVerification({
    google: `abc" /><script>evil</script>`,
  });
  assert.equal(v.google, "abcscriptevilscript");
  assert.equal(/[<>"' ]/.test(v.google), false);
});

test("normalize: non-string / missing / garbage → empty", () => {
  assert.deepEqual(normalizeSiteVerification(null), emptySiteVerification());
  assert.deepEqual(normalizeSiteVerification([]), emptySiteVerification());
  assert.deepEqual(normalizeSiteVerification("nope"), emptySiteVerification());
  assert.deepEqual(
    normalizeSiteVerification({ google: 42, bing: null }),
    emptySiteVerification(),
  );
});

test("normalize clamps to 200 chars", () => {
  const v = normalizeSiteVerification({ google: "a".repeat(500) });
  assert.equal(v.google.length, 200);
});

test("buildVerificationMeta: undefined when empty", () => {
  assert.equal(buildVerificationMeta(emptySiteVerification()), undefined);
});

test("buildVerificationMeta: only set fields, bing under other", () => {
  assert.deepEqual(buildVerificationMeta({ google: "g", bing: "", yandex: "" }), {
    google: "g",
  });
  assert.deepEqual(
    buildVerificationMeta({ google: "g", bing: "b", yandex: "y" }),
    { google: "g", yandex: "y", other: { "msvalidate.01": "b" } },
  );
  assert.deepEqual(buildVerificationMeta({ google: "", bing: "b", yandex: "" }), {
    other: { "msvalidate.01": "b" },
  });
});
