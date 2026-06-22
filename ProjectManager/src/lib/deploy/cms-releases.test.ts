import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReleases, refForVersion } from "./cms-releases.ts";

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
