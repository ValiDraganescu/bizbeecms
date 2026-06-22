import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReleases, refForVersion, isUpdateAvailable } from "./cms-releases.ts";

test("normalizeReleases keeps valid cms-v releases", () => {
  assert.deepEqual(
    normalizeReleases({
      tags: [
        { version: "0.6.0", tag: "cms-v0.6.0" },
        { version: "1.2.3", tag: "cms-v1.2.3" },
      ],
    }),
    // newest-first
    [
      { version: "1.2.3", tag: "cms-v1.2.3" },
      { version: "0.6.0", tag: "cms-v0.6.0" },
    ],
  );
});

test("normalizeReleases sorts newest-first by semver, not lexically", () => {
  const out = normalizeReleases({
    tags: [
      { version: "0.9.0", tag: "cms-v0.9.0" },
      { version: "0.10.0", tag: "cms-v0.10.0" },
      { version: "0.2.0", tag: "cms-v0.2.0" },
    ],
  });
  assert.deepEqual(
    out.map((r) => r.version),
    ["0.10.0", "0.9.0", "0.2.0"],
  );
});

test("normalizeReleases drops junk: non-semver, non-tag, dupes", () => {
  const out = normalizeReleases({
    tags: [
      { version: "0.6.0", tag: "cms-v0.6.0" },
      { version: "0.6.0", tag: "cms-v0.6.0" }, // dupe
      { version: "1.0", tag: "cms-v1.0" }, // partial semver
      { version: "1.0.0", tag: "v1.0.0" }, // wrong tag prefix
      { version: "main", tag: "main" }, // not a release
      { tag: "cms-v2.0.0" }, // missing version
      null,
      "nope",
    ],
  });
  assert.deepEqual(out, [{ version: "0.6.0", tag: "cms-v0.6.0" }]);
});

test("normalizeReleases is empty for malformed payloads", () => {
  assert.deepEqual(normalizeReleases(null), []);
  assert.deepEqual(normalizeReleases({}), []);
  assert.deepEqual(normalizeReleases({ tags: "x" }), []);
  assert.deepEqual(normalizeReleases([]), []);
});

test("refForVersion builds the cms-v tag", () => {
  assert.equal(refForVersion("0.6.0"), "cms-v0.6.0");
  assert.equal(refForVersion("12.3.45"), "cms-v12.3.45");
});

test("isUpdateAvailable flags an older deployed tag", () => {
  assert.equal(isUpdateAvailable("cms-v0.6.0", "1.2.3"), true);
  assert.equal(isUpdateAvailable("cms-v0.9.0", "0.10.0"), true); // semver, not lexical
});

test("isUpdateAvailable is false when up-to-date or newer", () => {
  assert.equal(isUpdateAvailable("cms-v1.2.3", "1.2.3"), false);
  assert.equal(isUpdateAvailable("cms-v2.0.0", "1.2.3"), false); // somehow newer → no badge
});

test("isUpdateAvailable degrades gracefully to false", () => {
  assert.equal(isUpdateAvailable(null, "1.2.3"), false); // never deployed
  assert.equal(isUpdateAvailable(undefined, "1.2.3"), false);
  assert.equal(isUpdateAvailable("main", "1.2.3"), false); // non-tag ref, not comparable
  assert.equal(isUpdateAvailable("cms-v0.6.0", null), false); // empty tag list
  assert.equal(isUpdateAvailable("cms-v0.6.0", undefined), false);
  assert.equal(isUpdateAvailable("cms-v0.6.0", "main"), false); // junk latest
});
