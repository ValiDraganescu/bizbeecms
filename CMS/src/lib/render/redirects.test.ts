/**
 * redirects — pure path normalization + lookup for 301/302 serving.
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeRedirectPath, lookupRedirect, type RedirectRow } from "./redirects.ts";
import { isEdgeCacheCandidate } from "./edge-cache.ts";

// ── normalizeRedirectPath ────────────────────────────────────────────────────
test("normalizeRedirectPath: ensures single leading slash, drops trailing", () => {
  assert.equal(normalizeRedirectPath("/old-page"), "/old-page");
  assert.equal(normalizeRedirectPath("old-page"), "/old-page");
  assert.equal(normalizeRedirectPath("/old-page/"), "/old-page");
  assert.equal(normalizeRedirectPath("///old//page//"), "/old/page");
});

test("normalizeRedirectPath: root stays '/'", () => {
  assert.equal(normalizeRedirectPath("/"), "/");
  assert.equal(normalizeRedirectPath(""), "/");
  assert.equal(normalizeRedirectPath("   "), "/");
});

test("normalizeRedirectPath: strips query + hash + origin", () => {
  assert.equal(normalizeRedirectPath("/blog/hello?ref=x#top"), "/blog/hello");
  assert.equal(normalizeRedirectPath("https://site.com/fi/vanha?a=1"), "/fi/vanha");
  assert.equal(normalizeRedirectPath("https://site.com"), "/");
});

test("normalizeRedirectPath: URL-decodes once, tolerates bad escapes", () => {
  assert.equal(normalizeRedirectPath("/caf%C3%A9"), "/café");
  assert.equal(normalizeRedirectPath("/bad%zz"), "/bad%zz"); // malformed → kept
});

test("normalizeRedirectPath: case-sensitive (web convention)", () => {
  assert.equal(normalizeRedirectPath("/About"), "/About");
});

// ── lookupRedirect ───────────────────────────────────────────────────────────
const rows: RedirectRow[] = [
  { fromPath: "/old-page", toPath: "/new-page", status: 301 },
  { fromPath: "/fi/vanha", toPath: "/fi/uusi", status: 302 },
  { fromPath: "/loop", toPath: "/loop", status: 301 }, // self-redirect
];

test("lookupRedirect: exact hit returns normalized target + status", () => {
  assert.deepEqual(lookupRedirect("/old-page", rows), { toPath: "/new-page", status: 301 });
  assert.deepEqual(lookupRedirect("/fi/vanha", rows), { toPath: "/fi/uusi", status: 302 });
});

test("lookupRedirect: normalizes the request path before matching", () => {
  assert.deepEqual(lookupRedirect("/old-page/", rows), { toPath: "/new-page", status: 301 });
  assert.deepEqual(lookupRedirect("old-page?x=1", rows), { toPath: "/new-page", status: 301 });
});

test("lookupRedirect: miss returns null", () => {
  assert.equal(lookupRedirect("/nope", rows), null);
});

test("lookupRedirect: self-redirect is treated as a miss (no loop)", () => {
  assert.equal(lookupRedirect("/loop", rows), null);
});

test("lookupRedirect: clamps unknown status to 301", () => {
  const weird: RedirectRow[] = [{ fromPath: "/a", toPath: "/b", status: 999 }];
  assert.deepEqual(lookupRedirect("/a", weird), { toPath: "/b", status: 301 });
});

test("lookupRedirect: works over a Map keyed by normalized fromPath", () => {
  const map = new Map(rows.map((r) => [r.fromPath, r]));
  assert.deepEqual(lookupRedirect("/old-page", map), { toPath: "/new-page", status: 301 });
  assert.equal(lookupRedirect("/nope", map), null);
});

// ── edge-cache gate skips redirect responses (caveat: assert, don't add cache) ─
test("redirect responses (non-200) are NOT edge-cache candidates", () => {
  for (const status of [301, 302, 307, 308]) {
    assert.equal(
      isEdgeCacheCandidate({ method: "GET", pathname: "/old-page", status, hasSetCookie: false }),
      false,
      `status ${status} must not be edge-cached`,
    );
  }
});
