/**
 * Pure unit tests for page-awareness (ai-assistant Slice 2): context detection,
 * tool scoping, and the per-context prompt. Dep-free `node --test` (project
 * convention). The pure module speaks tool NAMES; the route maps them to objects.
 *
 * Run: node --test scripts/tool-scopes.test.mjs
 * (loads the .ts source via the TS test loader the repo already uses for other
 *  *.test.mjs — see package.json "test" script.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectAdminContext,
  isAdminContext,
  toolsForContext,
  contextPrompt,
  resolveRequestContext,
  KNOWN_TOOL_NAMES,
} from "../src/lib/chat/tool-scopes.ts";

test("detectAdminContext reads the segment after /admin (no locale prefix)", () => {
  assert.equal(detectAdminContext("/admin/page-builder"), "page-builder");
  assert.equal(detectAdminContext("/admin/components"), "components");
  assert.equal(detectAdminContext("/admin/pages"), "pages");
  assert.equal(detectAdminContext("/admin/settings"), "settings");
  assert.equal(detectAdminContext("/admin/media"), "media");
});

test("detectAdminContext handles trailing slugs and query/hash", () => {
  assert.equal(detectAdminContext("/admin/page-builder/some-page"), "page-builder");
  assert.equal(detectAdminContext("/admin/settings?tab=theme"), "settings");
});

test("detectAdminContext falls back to general for unknown / non-admin / root", () => {
  assert.equal(detectAdminContext("/admin"), "general");
  assert.equal(detectAdminContext("/admin/sitemap"), "general"); // real route, no tools
  assert.equal(detectAdminContext("/admin/whatever"), "general");
  assert.equal(detectAdminContext("/login"), "general");
  assert.equal(detectAdminContext("/"), "general");
  assert.equal(detectAdminContext(""), "general");
});

test("detectAdminContext accepts a full URL too", () => {
  assert.equal(
    detectAdminContext("https://acme.example.com/admin/components"),
    "components",
  );
});

test("isAdminContext guards untrusted client input", () => {
  assert.equal(isAdminContext("settings"), true);
  assert.equal(isAdminContext("general"), true);
  assert.equal(isAdminContext("artworks"), false); // aicms-only, not ours
  assert.equal(isAdminContext(""), false);
  assert.equal(isAdminContext(undefined), false);
  assert.equal(isAdminContext(42), false);
});

test("toolsForContext only ever returns EXISTING tool names", () => {
  const known = new Set(KNOWN_TOOL_NAMES);
  for (const ctx of ["page-builder", "components", "pages", "settings", "media", "general"]) {
    const names = toolsForContext(ctx);
    assert.ok(names.length > 0, `${ctx} should expose at least one tool`);
    for (const n of names) {
      assert.ok(known.has(n), `${ctx} exposed unknown tool ${n}`);
    }
  }
});

test("toolsForContext scopes per page (write + Slice 3 read tools)", () => {
  // page-builder can both author and discover.
  const pb = new Set(toolsForContext("page-builder"));
  for (const n of ["create_component", "create_page", "list_components", "get_page"]) {
    assert.ok(pb.has(n), `page-builder should expose ${n}`);
  }
  // media stays read-only-to-assets (unchanged).
  assert.deepEqual([...toolsForContext("media")], ["list_assets"]);
  // settings reads brand/theme/locales + translate (no create tools).
  const settings = new Set(toolsForContext("settings"));
  for (const n of ["translate", "list_locales", "get_brand_identity", "get_theme"]) {
    assert.ok(settings.has(n), `settings should expose ${n}`);
  }
  assert.ok(!settings.has("create_component"), "settings must NOT author components");
  // Slice 3 part 2: settings can update brand/theme; page-builder can update comp/blocks.
  for (const n of ["update_brand_identity", "update_theme"]) {
    assert.ok(settings.has(n), `settings should expose ${n}`);
  }
  for (const n of ["update_component", "update_page_blocks", "list_builtin_types"]) {
    assert.ok(pb.has(n), `page-builder should expose ${n}`);
  }
  // general gets the full catalog.
  assert.deepEqual([...toolsForContext("general")].sort(), [...KNOWN_TOOL_NAMES].sort());
});

test("contextPrompt is non-empty and context-specific", () => {
  const pb = contextPrompt("page-builder");
  const settings = contextPrompt("settings");
  assert.ok(pb.length > 0 && settings.length > 0);
  assert.notEqual(pb, settings);
  assert.match(pb, /Page Builder/i);
});

test("resolveRequestContext: explicit valid context wins, else pathname, else general", () => {
  // valid explicit context wins (even if a pathname is also present)
  assert.equal(resolveRequestContext("settings", "/admin/pages"), "settings");
  // invalid context falls through to pathname detection
  assert.equal(resolveRequestContext("bogus", "/admin/components"), "components");
  // no context → detect from pathname
  assert.equal(resolveRequestContext(undefined, "/admin/page-builder"), "page-builder");
  // nothing usable → general (full toolset). Never throws on untrusted input.
  assert.equal(resolveRequestContext(undefined, undefined), "general");
  assert.equal(resolveRequestContext(null, 42), "general");
  // shared contract with the debug + POST routes: same inputs, same answer.
  assert.equal(resolveRequestContext("media", null), "media");
});
