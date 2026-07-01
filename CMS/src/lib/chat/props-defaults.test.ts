/**
 * applyDefaults — persisting the Develop props sidebar's placeholder edits.
 *
 * Regression for: toggling a link prop's "Open in new tab" saved, then unset —
 * the companion `<name>NewTab` value isn't a declared prop, so the schema
 * allowlist dropped it. It now round-trips via the link spec's `newTab` key.
 *
 * Relative `.ts` import — `node --test` can't resolve the `@/` alias (CAVEAT).
 * Run: node --test src/lib/chat/props-defaults.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDefaults } from "./props-defaults.ts";
import { parsePropsSchema } from "../pages/page-blocks.ts";

const SCHEMA = JSON.stringify({
  bookHref: { type: "link", default: "/book" },
  name: { type: "string", default: "Vinkkeli" },
});

test("applyDefaults: new-tab toggle round-trips through the schema", () => {
  const saved = applyDefaults(SCHEMA, { bookHref: "/reserve", bookHrefNewTab: true });
  const field = parsePropsSchema(saved).find((f) => f.name === "bookHref");
  assert.equal(field?.default, "/reserve");
  assert.equal(field?.newTab, true);

  // Untoggling removes the flag again.
  const cleared = applyDefaults(saved, { bookHrefNewTab: false });
  const cf = parsePropsSchema(cleared).find((f) => f.name === "bookHref");
  assert.equal(cf?.newTab, undefined);
});

test("applyDefaults: untouched props keep their defaults; unknown props ignored", () => {
  const saved = JSON.parse(applyDefaults(SCHEMA, { bogus: "x" })) as Record<
    string,
    { default?: unknown }
  >;
  assert.equal(saved.bookHref.default, "/book");
  assert.equal(saved.name.default, "Vinkkeli");
  assert.equal("bogus" in saved, false);
});
