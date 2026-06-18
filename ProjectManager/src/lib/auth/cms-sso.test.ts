import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendNonce,
  classifyCmsReturnUrl,
  newSsoNonce,
  safeCmsReturnUrl,
  safeNextPath,
} from "./cms-sso.ts";

test("classifyCmsReturnUrl accepts a per-Site CMS worker host", () => {
  const r = classifyCmsReturnUrl(
    "https://bizbeecms-cms-test-1.vali-draganescu88.workers.dev/api/auth/sso-callback",
  );
  assert.ok(r && "url" in r);
});

test("classifyCmsReturnUrl accepts our own zone", () => {
  const r = classifyCmsReturnUrl("https://test-1.bizbeecms.com/api/auth/sso-callback");
  assert.ok(r && "url" in r);
});

test("classifyCmsReturnUrl returns {host} for an unknown https host (maybe a custom domain)", () => {
  const r = classifyCmsReturnUrl("https://restovista.com/api/auth/sso-callback");
  assert.deepEqual(r, { host: "restovista.com" });
});

test("classifyCmsReturnUrl rejects http, malformed, and empty", () => {
  assert.equal(classifyCmsReturnUrl("http://bizbeecms-cms-x.workers.dev/"), null);
  assert.equal(classifyCmsReturnUrl("not a url"), null);
  assert.equal(classifyCmsReturnUrl(null), null);
});

test("safeCmsReturnUrl only passes statically-known hosts (custom domain → null)", () => {
  assert.ok(
    safeCmsReturnUrl("https://bizbeecms-cms-a.x.workers.dev/api/auth/sso-callback"),
  );
  assert.equal(safeCmsReturnUrl("https://restovista.com/api/auth/sso-callback"), null);
});

test("a non-CMS workers.dev host is NOT accepted as a static CMS host", () => {
  // The projectmanager worker itself must not be a valid CMS return target.
  const r = classifyCmsReturnUrl(
    "https://bizbeecms-projectmanager.vali-draganescu88.workers.dev/api/auth/sso-callback",
  );
  assert.deepEqual(r, { host: "bizbeecms-projectmanager.vali-draganescu88.workers.dev" });
});

test("safeNextPath allows same-origin paths, rejects absolute + protocol-relative", () => {
  assert.equal(safeNextPath("/api/auth/cms-sso?return=x"), "/api/auth/cms-sso?return=x");
  assert.equal(safeNextPath("https://evil.com"), "/");
  assert.equal(safeNextPath("//evil.com"), "/");
  assert.equal(safeNextPath(null), "/");
});

test("newSsoNonce is 64 hex chars and unique per call", () => {
  const a = newSsoNonce();
  const b = newSsoNonce();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("appendNonce adds ?sso= without dropping the path", () => {
  const out = appendNonce("https://host.workers.dev/api/auth/sso-callback", "abc123");
  assert.equal(out, "https://host.workers.dev/api/auth/sso-callback?sso=abc123");
});
