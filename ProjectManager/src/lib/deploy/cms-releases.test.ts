import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReleases, refForVersion, isUpdateAvailable, trimReleases } from "./cms-releases.ts";

test("trimReleases: last 3 majors, 5 minors/major, last patch/minor", () => {
  const v = (s: string) => ({ version: s, tag: `r-${s}` });
  // newest-first input spanning 4 majors with extra minors and patches
  const input = [
    v("4.0.0"),
    v("3.7.2"), v("3.7.1"), v("3.7.0"), // only 3.7.2 (last patch) should survive
    v("3.6.0"), v("3.5.0"), v("3.4.0"), v("3.3.0"), v("3.2.0"), // 3.2.0 is the 6th minor → dropped
    v("2.1.0"),
    v("1.0.0"), // 4th-newest major → dropped entirely
  ];
  const out = trimReleases(input).map((r) => r.version);
  assert.deepEqual(out, [
    "4.0.0",
    "3.7.2",
    "3.6.0", "3.5.0", "3.4.0", "3.3.0", // 4 more minors → 5 total for major 3
    "2.1.0",
  ]);
});

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

test("refForVersion builds the r- tag", () => {
  assert.equal(refForVersion("0.6.0"), "r-0.6.0");
  assert.equal(refForVersion("12.3.45"), "r-12.3.45");
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
