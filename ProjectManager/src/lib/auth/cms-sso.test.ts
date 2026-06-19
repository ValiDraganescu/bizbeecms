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

test("classifyCmsReturnUrl accepts <slug>.site.bizbeecms.com (custom-domains scheme, own-zone)", () => {
  const r = classifyCmsReturnUrl("https://acme.site.bizbeecms.com/api/auth/sso-callback");
  assert.ok(r && "url" in r);
});

test("classifyCmsReturnUrl accepts manager.bizbeecms.com (PM custom domain, own-zone)", () => {
  const r = classifyCmsReturnUrl("https://manager.bizbeecms.com/api/auth/sso-callback");
  assert.ok(r && "url" in r);
});

test("classifyCmsReturnUrl rejects a lookalike that only ends in our zone label (suffix-spoof)", () => {
  // `acme.site.bizbeecms.com.evil.com` must NOT pass own-zone: the host ends in
  // `.evil.com`, not `.bizbeecms.com`, so it is treated as an unknown host.
  const r = classifyCmsReturnUrl(
    "https://acme.site.bizbeecms.com.evil.com/api/auth/sso-callback",
  );
  assert.deepEqual(r, { host: "acme.site.bizbeecms.com.evil.com" });
});

test("classifyCmsReturnUrl returns {host} for a plain workers.dev attacker host", () => {
  // A bare attacker worker on workers.dev is neither own-zone nor an own-account
  // CMS worker → unknown host (HOST_MAP check would then reject it).
  const r = classifyCmsReturnUrl("https://evil.attacker.workers.dev/api/auth/sso-callback");
  assert.deepEqual(r, { host: "evil.attacker.workers.dev" });
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
    safeCmsReturnUrl(
      "https://bizbeecms-cms-a.vali-draganescu88.workers.dev/api/auth/sso-callback",
    ),
  );
  assert.equal(safeCmsReturnUrl("https://restovista.com/api/auth/sso-callback"), null);
});

test("a bizbeecms-cms-* worker on ANOTHER account is NOT a static CMS host (nonce-capture guard)", () => {
  // The allowlist must anchor to OUR account suffix, not bare .workers.dev —
  // else an attacker's worker named bizbeecms-cms-* would capture the SSO nonce.
  const r = classifyCmsReturnUrl(
    "https://bizbeecms-cms-evil.attacker.workers.dev/api/auth/sso-callback",
  );
  assert.deepEqual(r, { host: "bizbeecms-cms-evil.attacker.workers.dev" });
});

test("a non-CMS workers.dev host is NOT accepted as a static CMS host", () => {
  // The projectmanager worker itself must not be a valid CMS return target.
  const r = classifyCmsReturnUrl(
    "https://bizbeecms-projectmanager.vali-draganescu88.workers.dev/api/auth/sso-callback",
  );
  assert.deepEqual(r, { host: "bizbeecms-projectmanager.vali-draganescu88.workers.dev" });
});

test("classifyCmsReturnUrl rejects sub-subdomain squatting on our suffix", () => {
  // endsWith(suffix) alone would pass this; the 4-label check rejects it.
  const r = classifyCmsReturnUrl(
    "https://bizbeecms-cms-x.evil.vali-draganescu88.workers.dev/api/auth/sso-callback",
  );
  assert.deepEqual(r, {
    host: "bizbeecms-cms-x.evil.vali-draganescu88.workers.dev",
  });
});

test("safeNextPath allows same-origin paths, rejects absolute + protocol-relative", () => {
  assert.equal(safeNextPath("/api/auth/cms-sso?return=x"), "/api/auth/cms-sso?return=x");
  assert.equal(safeNextPath("https://evil.com"), "/");
  assert.equal(safeNextPath("//evil.com"), "/");
  assert.equal(safeNextPath(null), "/");
});

test("safeNextPath rejects backslash, encoded-slash, and control-char bypasses", () => {
  assert.equal(safeNextPath("/\\evil.com"), "/");
  assert.equal(safeNextPath("/\\/evil.com"), "/");
  assert.equal(safeNextPath("/%2fevil.com"), "/");
  assert.equal(safeNextPath("/%5cevil.com"), "/");
  assert.equal(safeNextPath("/%2Fevil.com"), "/"); // case-insensitive
  assert.equal(safeNextPath("/\tevil"), "/"); // tab stripped during parse
  assert.equal(safeNextPath("/\nevil"), "/"); // newline stripped during parse
  // A legit nested path still survives.
  assert.equal(safeNextPath("/sites/abc/deploy"), "/sites/abc/deploy");
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
