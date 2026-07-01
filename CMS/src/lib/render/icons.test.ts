/**
 * Pure icon-slot + SVG-normalization tests (icon-sets epic). node --test.
 * Covers: slot regex, name collection, text splitting, validation, Iconify URLs,
 * and the normalize() paint-preservation contract (stroke vs fill must survive).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ICON_SET,
  isValidIconSet,
  isValidIconName,
  hasIconSlot,
  collectIconNames,
  splitIconText,
  iconifySvgUrl,
  iconifySearchUrl,
  normalizeIconSvg,
} from "./icons.ts";

test("default set is lucide", () => {
  assert.equal(DEFAULT_ICON_SET, "lucide");
});

test("set/name validation accepts hyphenated lowercase, rejects junk", () => {
  assert.ok(isValidIconSet("lucide"));
  assert.ok(isValidIconSet("material-symbols"));
  assert.ok(!isValidIconSet("Lucide")); // uppercase
  assert.ok(!isValidIconSet("a/b")); // slash
  assert.ok(isValidIconName("arrow-right"));
  assert.ok(isValidIconName("user-2"));
  assert.ok(!isValidIconName("Arrow")); // uppercase
  assert.ok(!isValidIconName("a b")); // space
});

test("hasIconSlot / collectIconNames find quoted slots only", () => {
  const text = 'Book {{icon "calendar"}} now {{icon "arrow-right"}} {{t title}} {{plain}}';
  assert.ok(hasIconSlot(text));
  const names = new Set<string>();
  collectIconNames(text, names);
  assert.deepEqual([...names], ["calendar", "arrow-right"]);
  // {{t title}} and {{plain}} are NOT icon slots.
  assert.ok(!hasIconSlot("{{t title}} {{plain}}"));
});

test("collectIconNames skips invalid names and dedups", () => {
  const names = new Set<string>();
  collectIconNames('{{icon "calendar"}}{{icon "calendar"}}', names);
  assert.deepEqual([...names], ["calendar"]);
});

test("splitIconText interleaves text and icon parts in order", () => {
  assert.deepEqual(splitIconText('Go {{icon "arrow-right"}} now'), [
    { kind: "text", text: "Go " },
    { kind: "icon", name: "arrow-right" },
    { kind: "text", text: " now" },
  ]);
  // No slot → single text part (fast path).
  assert.deepEqual(splitIconText("plain text"), [{ kind: "text", text: "plain text" }]);
  // Slot at both ends → no empty text parts around them.
  assert.deepEqual(splitIconText('{{icon "x"}}'), [{ kind: "icon", name: "x" }]);
});

test("iconify URLs encode set + name", () => {
  assert.equal(iconifySvgUrl("lucide", "arrow-right"), "https://api.iconify.design/lucide/arrow-right.svg");
  const s = iconifySearchUrl("lucide", "cal", 10);
  assert.match(s, /\/search\?query=cal&prefix=lucide&limit=10$/);
  // limit clamps into 1..999.
  assert.match(iconifySearchUrl("lucide", "x", 99999), /limit=999$/);
});

// ── normalizeIconSvg ─────────────────────────────────────────────────────────

test("normalize PRESERVES stroke-based paint (Lucide) — no forced fill", () => {
  // Lucide ships fill:none + stroke:currentColor.
  const lucide =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M5 12h14"/></svg>';
  const out = normalizeIconSvg(lucide);
  assert.ok(out);
  assert.match(out, /fill="none"/); // fill:none survives (not overwritten)
  assert.match(out, /stroke="currentColor"/);
  assert.match(out, /stroke-width="2"/);
  assert.match(out, /stroke-linecap="round"/);
  assert.doesNotMatch(out, /width="24"/); // fixed px dropped
  assert.match(out, /width="1em"/); // scalable size added
  assert.match(out, /aria-hidden="true"/);
  assert.match(out, /<path d="M5 12h14"\/>/); // body intact
});

test("normalize PRESERVES fill-based paint (Material)", () => {
  const material =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
    'fill="currentColor"><path d="M3 3h18v18H3z"/></svg>';
  const out = normalizeIconSvg(material);
  assert.ok(out);
  assert.match(out, /fill="currentColor"/);
  assert.doesNotMatch(out, /stroke=/); // didn't invent a stroke
});

test("normalize rewrites explicit hex colors in the body to currentColor", () => {
  const colored =
    '<svg viewBox="0 0 24 24"><path fill="#ff0000" d="M0 0h24v24H0z"/></svg>';
  const out = normalizeIconSvg(colored);
  assert.ok(out);
  assert.match(out, /fill="currentColor"/);
  assert.doesNotMatch(out, /#ff0000/);
});

test("normalize never overwrites fill=none in the body", () => {
  const out = normalizeIconSvg('<svg viewBox="0 0 24 24"><path fill="none" stroke="#000" d="M1 1"/></svg>');
  assert.ok(out);
  assert.match(out, /fill="none"/);
  assert.match(out, /stroke="currentColor"/); // the #000 stroke became currentColor
});

test("normalize defaults to fill:currentColor when root declares neither", () => {
  const out = normalizeIconSvg('<svg viewBox="0 0 24 24"><path d="M1 1h2"/></svg>');
  assert.ok(out);
  assert.match(out, /fill="currentColor"/);
});

test("normalize rejects non-svg and script-bearing input", () => {
  assert.equal(normalizeIconSvg("not svg"), null);
  assert.equal(normalizeIconSvg("<div>x</div>"), null);
  assert.equal(normalizeIconSvg('<svg><script>alert(1)</script></svg>'), null);
  assert.equal(normalizeIconSvg(""), null);
});
