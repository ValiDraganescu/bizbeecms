import { test } from "node:test";
import assert from "node:assert/strict";
import { planLocalCleanup } from "./local-cleanup.ts";

test("planLocalCleanup: refuses anything that isn't a strict slug", () => {
  for (const bad of ["", "../etc", "a/b", "UPPER", "space slug", "-lead", "trail-", "a".repeat(65)]) {
    assert.deepEqual(planLocalCleanup(bad, null), {
      removeSiteDir: false,
      removeMarker: false,
    });
  }
});

test("planLocalCleanup: removes the site dir; marker only when it points at this Site", () => {
  assert.deepEqual(planLocalCleanup("taivaanranta", null), {
    removeSiteDir: true,
    removeMarker: false,
  });
  assert.deepEqual(
    planLocalCleanup("taivaanranta", JSON.stringify({ slug: "acme", id: "x" })),
    { removeSiteDir: true, removeMarker: false },
  );
  assert.deepEqual(
    planLocalCleanup("taivaanranta", JSON.stringify({ slug: "taivaanranta", id: "x" })),
    { removeSiteDir: true, removeMarker: true },
  );
});

test("planLocalCleanup: a corrupt marker never blocks the dir removal", () => {
  assert.deepEqual(planLocalCleanup("acme", "not json {"), {
    removeSiteDir: true,
    removeMarker: false,
  });
});
