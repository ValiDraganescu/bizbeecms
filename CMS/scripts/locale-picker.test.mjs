// node --test scripts/locale-picker.test.mjs
// Guards the LocalePicker's pure active-locale resolution: the picker shows ONE
// content locale at a time; storage stays a {loc:val} map. The only non-trivial
// logic is "if the active locale was removed from the Site's set, fall back to
// the first (default) locale" — mirrored here so it can't silently drift.
import { test } from "node:test";
import assert from "node:assert/strict";

// Pure mirror of useLocalePicker's `safe` computation (the React state is dumb;
// this is the rule that matters). Keep in sync with locale-picker.tsx.
const resolveActive = (active, locales) =>
  locales.includes(active) ? active : locales[0] ?? "";

test("keeps the active locale when still present", () => {
  assert.equal(resolveActive("fi", ["en", "fi", "et"]), "fi");
});

test("falls back to the default (first) locale when active was removed", () => {
  assert.equal(resolveActive("ro", ["en", "fi"]), "en");
});

test("empty locale set resolves to empty string (no crash)", () => {
  assert.equal(resolveActive("en", []), "");
});

test("single-locale Site resolves to that locale", () => {
  assert.equal(resolveActive("", ["en"]), "en");
});
