/**
 * redirects — pure path normalization + lookup for 301/302 serving.
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeRedirectPath,
  lookupRedirect,
  redirectsForRename,
  type RedirectRow,
} from "./redirects.ts";
import { descendantIds, type PathPageRow } from "./localize-paths.ts";
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

// ── redirectsForRename (auto-capture on slug/parent/localized-slug edit) ──────
// Tree: home (/), about → team. Two content locales: en (default) + fi.
function tree(overrides: Record<string, PathPageRow> = {}): PathPageRow[] {
  const base: Record<string, PathPageRow> = {
    home: { id: "home", slug: "home", parentPageId: null, localizedSlugs: null },
    about: { id: "about", slug: "about", parentPageId: null, localizedSlugs: null },
    team: { id: "team", slug: "team", parentPageId: "about", localizedSlugs: null },
  };
  const merged: Record<string, PathPageRow> = { ...base, ...overrides };
  return Object.keys(merged).map((k) => merged[k]);
}

test("redirectsForRename: default-slug rename captures parent + descendant", () => {
  const oldRows = tree();
  const newRows = tree({ about: { id: "about", slug: "company", parentPageId: null, localizedSlugs: null } });
  const affected = descendantIds(oldRows, "about");
  const pairs = redirectsForRename(oldRows, newRows, affected, "en", ["en", "fi"]);
  // about /about→/company, team /about/team→/company/team, in both locales.
  const set = new Set(pairs.map((p) => `${p.from}=>${p.to}`));
  assert.ok(set.has("/about=>/company"));
  assert.ok(set.has("/about/team=>/company/team"));
  assert.ok(set.has("/fi/about=>/fi/company"));
  assert.ok(set.has("/fi/about/team=>/fi/company/team"));
});

test("redirectsForRename: unchanged page yields no pairs", () => {
  const rows = tree();
  const pairs = redirectsForRename(rows, rows, descendantIds(rows, "about"), "en", ["en", "fi"]);
  assert.deepEqual(pairs, []);
});

test("redirectsForRename: localized-slug override moves only that locale", () => {
  const oldRows = tree();
  const newRows = tree({
    about: { id: "about", slug: "about", parentPageId: null, localizedSlugs: '{"fi":"meista"}' },
  });
  const pairs = redirectsForRename(oldRows, newRows, descendantIds(oldRows, "about"), "en", ["en", "fi"]);
  const set = new Set(pairs.map((p) => `${p.from}=>${p.to}`));
  // en path unchanged; fi about + fi team both shift.
  assert.ok(!set.has("/about=>/about"));
  assert.ok(set.has("/fi/about=>/fi/meista"));
  assert.ok(set.has("/fi/about/team=>/fi/meista/team"));
});

test("redirectsForRename: dedupes duplicate from paths (first wins)", () => {
  const oldRows = tree();
  const newRows = tree({ about: { id: "about", slug: "company", parentPageId: null, localizedSlugs: null } });
  // Pass the parent twice — should not emit duplicate /about redirects.
  const pairs = redirectsForRename(oldRows, newRows, ["about", "about"], "en", ["en"]);
  const froms = pairs.map((p) => p.from);
  assert.equal(new Set(froms).size, froms.length);
  assert.deepEqual(pairs, [{ from: "/about", to: "/company" }]);
});

test("descendantIds: page + full subtree, cycle-safe", () => {
  const rows = tree();
  assert.deepEqual(descendantIds(rows, "about").sort(), ["about", "team"]);
  assert.deepEqual(descendantIds(rows, "team"), ["team"]);
  // self-parent cycle must not hang.
  const cyclic: PathPageRow[] = [{ id: "x", slug: "x", parentPageId: "x", localizedSlugs: null }];
  assert.deepEqual(descendantIds(cyclic, "x"), ["x"]);
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
