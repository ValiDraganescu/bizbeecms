/**
 * PM-SSO predicate tests (ai-widget-ux). SSO synthetic emails → true; local /
 * Google / missing → false. Runs under `node --test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPmSsoUser, isPmSsoEmail } from "./pm-sso.ts";

test("SSO synthetic email is PM-SSO", () => {
  assert.equal(isPmSsoUser({ email: "abc123@pm.sso" }), true);
  assert.equal(isPmSsoEmail("USER-1@PM.SSO"), true); // case-insensitive
  assert.equal(isPmSsoEmail("  x@pm.sso  "), true); // trimmed
});

test("local / Google / arbitrary emails are NOT PM-SSO", () => {
  assert.equal(isPmSsoUser({ email: "vali@gmail.com" }), false);
  assert.equal(isPmSsoUser({ email: "admin@acme.co" }), false);
  assert.equal(isPmSsoEmail("pm.sso@evil.com"), false); // suffix only, not substring
});

test("missing / null email is NOT PM-SSO (fail-closed)", () => {
  assert.equal(isPmSsoUser(null), false);
  assert.equal(isPmSsoUser(undefined), false);
  assert.equal(isPmSsoUser({ email: null }), false);
  assert.equal(isPmSsoUser({ email: "" }), false);
});
