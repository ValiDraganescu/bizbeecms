import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeAssign,
  hasGlobalAssignScope,
  type AssignActor,
} from "./manage-users.ts";

const superAdmin: AssignActor = { role: "SuperAdmin", countries: [], tagIds: [] };
const globalAdmin: AssignActor = { role: "Admin", countries: [], tagIds: [] };
const scopedAdmin: AssignActor = {
  role: "Admin",
  countries: ["FI", "EE"],
  tagIds: ["t1", "t2"],
};

test("hasGlobalAssignScope: SuperAdmin + empty-country actors are global", () => {
  assert.equal(hasGlobalAssignScope(superAdmin), true);
  assert.equal(hasGlobalAssignScope(globalAdmin), true);
  assert.equal(hasGlobalAssignScope(scopedAdmin), false);
});

test("global actor may grant anything, including the empty/global set", () => {
  assert.equal(authorizeAssign(superAdmin, [], []), null);
  assert.equal(authorizeAssign(superAdmin, ["FI"], ["x"]), null);
  assert.equal(authorizeAssign(globalAdmin, [], []), null);
  assert.equal(authorizeAssign(globalAdmin, ["SE"], ["any"]), null);
});

test("scoped actor cannot grant the global (empty) country set", () => {
  assert.equal(authorizeAssign(scopedAdmin, [], []), "countryNotAllowed");
});

test("scoped actor must grant a subset of their own countries", () => {
  assert.equal(authorizeAssign(scopedAdmin, ["FI"], []), null);
  assert.equal(authorizeAssign(scopedAdmin, ["FI", "EE"], []), null);
  assert.equal(authorizeAssign(scopedAdmin, ["SE"], []), "countryNotAllowed");
  assert.equal(authorizeAssign(scopedAdmin, ["FI", "SE"], []), "countryNotAllowed");
});

test("scoped actor may grant only tags they themselves hold", () => {
  assert.equal(authorizeAssign(scopedAdmin, ["FI"], ["t1"]), null);
  assert.equal(authorizeAssign(scopedAdmin, ["FI"], ["t1", "t2"]), null);
  assert.equal(authorizeAssign(scopedAdmin, ["FI"], ["t3"]), "tagNotAllowed");
  assert.equal(authorizeAssign(scopedAdmin, ["FI"], ["t1", "t3"]), "tagNotAllowed");
});
