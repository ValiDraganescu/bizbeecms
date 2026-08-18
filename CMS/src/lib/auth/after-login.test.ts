import { test } from "node:test";
import assert from "node:assert/strict";
import { afterLoginTarget, readCookie, AFTER_LOGIN_COOKIE } from "./guard-core.ts";

test("afterLoginTarget honors only a same-origin consent path", () => {
  assert.equal(afterLoginTarget("/oauth/authorize?client_id=x&state=y"), "/oauth/authorize?client_id=x&state=y");
  assert.equal(afterLoginTarget(null), "/admin");
  assert.equal(afterLoginTarget(""), "/admin");
  assert.equal(afterLoginTarget("/admin/settings"), "/admin");
  assert.equal(afterLoginTarget("https://evil.example/oauth/authorize?x"), "/admin");
  assert.equal(afterLoginTarget("//evil.example/oauth/authorize?x"), "/admin");
  assert.equal(afterLoginTarget("/oauth/authorize?x\r\nSet-Cookie: a=b"), "/admin");
  assert.equal(afterLoginTarget("/oauth/authorize"), "/admin"); // no request → nothing to resume
});

test("readCookie picks the named cookie and URL-decodes it", () => {
  const hdr = `bizbee_session=abc; ${AFTER_LOGIN_COOKIE}=${encodeURIComponent("/oauth/authorize?a=1&b=2")}; x=y`;
  assert.equal(readCookie(hdr, AFTER_LOGIN_COOKIE), "/oauth/authorize?a=1&b=2");
  assert.equal(readCookie(hdr, "x"), "y");
  assert.equal(readCookie(hdr, "nope"), "");
  assert.equal(readCookie(null, "x"), "");
});
