/**
 * robots-txt — per-Site robots.txt builder. Dep-free node --test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildRobotsTxt,
  defaultRobotsConfig,
  normalizeRobotsConfig,
  type RobotsConfig,
} from "./robots-txt.ts";

// ── defaults ─────────────────────────────────────────────────────────────────

test("default config: allow all, disallow the private surface", () => {
  const c = defaultRobotsConfig();
  assert.equal(c.freeText, "");
  assert.deepEqual(c.groups, [
    { userAgent: "*", disallow: ["/admin", "/api", "/preview"], allow: [] },
  ]);
});

test("default renders the standard grammar + sitemap pointer", () => {
  const txt = buildRobotsTxt(defaultRobotsConfig(), "https://x.example.com");
  assert.equal(
    txt,
    "User-agent: *\n" +
      "Disallow: /admin\n" +
      "Disallow: /api\n" +
      "Disallow: /preview\n" +
      "\n" +
      "Sitemap: https://x.example.com/sitemap.xml\n",
  );
});

// ── origin handling ────────────────────────────────────────────────────────

test("null origin omits the sitemap pointer (no wrong host)", () => {
  const txt = buildRobotsTxt(defaultRobotsConfig(), null);
  assert.ok(!txt.includes("Sitemap:"));
  assert.ok(txt.endsWith("\n"));
});

test("origin trailing slashes are stripped in the pointer", () => {
  const txt = buildRobotsTxt(defaultRobotsConfig(), "https://x.example.com///");
  assert.ok(txt.includes("Sitemap: https://x.example.com/sitemap.xml\n"));
});

// ── free-text override ───────────────────────────────────────────────────────

test("free-text override is served verbatim, structured rules ignored", () => {
  const c: RobotsConfig = {
    groups: [{ userAgent: "*", disallow: ["/admin"], allow: [] }],
    freeText: "User-agent: BadBot\nDisallow: /",
  };
  const txt = buildRobotsTxt(c, "https://x.example.com");
  assert.ok(txt.startsWith("User-agent: BadBot\nDisallow: /"));
  assert.ok(!txt.includes("/admin"));
  // Sitemap still appended after the override.
  assert.ok(txt.includes("Sitemap: https://x.example.com/sitemap.xml"));
});

test("override that already has its own Sitemap line: we don't double-add", () => {
  const c: RobotsConfig = {
    groups: [],
    freeText: "User-agent: *\nSitemap: https://custom/sm.xml",
  };
  const txt = buildRobotsTxt(c, "https://x.example.com");
  assert.equal(txt.match(/Sitemap:/g)?.length, 1);
  assert.ok(txt.includes("Sitemap: https://custom/sm.xml"));
});

// ── normalization / hardening ────────────────────────────────────────────────

test("garbage input falls back to the seeded default", () => {
  assert.deepEqual(normalizeRobotsConfig(null), defaultRobotsConfig());
  assert.deepEqual(normalizeRobotsConfig("nope"), defaultRobotsConfig());
  assert.deepEqual(normalizeRobotsConfig({ groups: 5 }), defaultRobotsConfig());
});

test("drops paths without a leading slash and with CR/LF injection", () => {
  const c = normalizeRobotsConfig({
    groups: [
      {
        userAgent: "*",
        disallow: ["/ok", "no-slash", "/bad\ninjected: x"],
        allow: ["/fine"],
      },
    ],
    freeText: "",
  });
  assert.deepEqual(c.groups[0].disallow, ["/ok"]);
  assert.deepEqual(c.groups[0].allow, ["/fine"]);
});

test("drops groups with a blank / newline-bearing user-agent", () => {
  const c = normalizeRobotsConfig({
    groups: [
      { userAgent: "", disallow: [], allow: [] },
      { userAgent: "Bad\nBot", disallow: [], allow: [] },
      { userAgent: "Googlebot", disallow: ["/x"], allow: [] },
    ],
    freeText: "",
  });
  assert.equal(c.groups.length, 1);
  assert.equal(c.groups[0].userAgent, "Googlebot");
});

test("allow lines render before disallow within a group", () => {
  const txt = buildRobotsTxt(
    {
      groups: [{ userAgent: "*", disallow: ["/admin"], allow: ["/admin/public"] }],
      freeText: "",
    },
    null,
  );
  assert.ok(txt.indexOf("Allow: /admin/public") < txt.indexOf("Disallow: /admin"));
});

test("multiple groups separated by a blank line", () => {
  const txt = buildRobotsTxt(
    {
      groups: [
        { userAgent: "*", disallow: ["/api"], allow: [] },
        { userAgent: "Googlebot", disallow: [], allow: ["/"] },
      ],
      freeText: "",
    },
    null,
  );
  assert.equal(
    txt,
    "User-agent: *\n" +
      "Disallow: /api\n" +
      "\n" +
      "User-agent: Googlebot\n" +
      "Allow: /\n",
  );
});
