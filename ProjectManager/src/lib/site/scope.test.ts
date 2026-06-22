import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageSite, type SiteScope } from "./scope.ts";

// A Site in FI tagged "t1".
const site: SiteScope = { country: "FI", tagIds: ["t1"] };

test("SuperAdmin reaches any Site (no scope needed)", () => {
  assert.equal(canManageSite({ role: "SuperAdmin" }, [], [], site), true);
  assert.equal(
    canManageSite({ role: "SuperAdmin" }, [], [], { country: null, tagIds: [] }),
    true,
  );
});

test("global Admin (no countries) reaches any Site", () => {
  assert.equal(canManageSite({ role: "Admin" }, [], [], site), true);
});

test("country-scoped Admin: country gates, tags ignored", () => {
  assert.equal(canManageSite({ role: "Admin" }, ["FI"], [], site), true);
  assert.equal(canManageSite({ role: "Admin" }, ["EE"], [], site), false);
  // global Site excluded for a scoped Admin
  assert.equal(
    canManageSite({ role: "Admin" }, ["FI"], [], { country: null, tagIds: [] }),
    false,
  );
});

test("Manager: country match only (no tag overlap) → DENIED", () => {
  assert.equal(canManageSite({ role: "Manager" }, ["FI"], ["other"], site), false);
});

test("Manager: tag match only (wrong country) → DENIED", () => {
  assert.equal(canManageSite({ role: "Manager" }, ["EE"], ["t1"], site), false);
});

test("Manager: country AND tag both match → ALLOWED", () => {
  assert.equal(canManageSite({ role: "Manager" }, ["FI"], ["t1"], site), true);
  // any-of within a dimension
  assert.equal(
    canManageSite({ role: "Manager" }, ["EE", "FI"], ["x", "t1"], site),
    true,
  );
});

test("Manager with empty countries or empty tags reaches nothing", () => {
  assert.equal(canManageSite({ role: "Manager" }, [], ["t1"], site), false);
  assert.equal(canManageSite({ role: "Manager" }, ["FI"], [], site), false);
  assert.equal(
    canManageSite({ role: "Manager" }, ["FI"], ["t1"], { country: "FI", tagIds: [] }),
    false,
  );
});

test("Editor reaches nothing by scope (assignment only)", () => {
  assert.equal(canManageSite({ role: "Editor" }, ["FI"], ["t1"], site), false);
});
