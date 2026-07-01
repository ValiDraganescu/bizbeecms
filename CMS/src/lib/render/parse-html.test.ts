/**
 * formatHtml round-trip idempotency (node --test, no @/ imports).
 *
 * Regression: a mixed-content node (a `{{t slot}}` text node beside a sibling
 * ELEMENT, e.g. a Hero eyebrow `<span><span/> {{t eyebrow}}</span>`) used to
 * accrete newlines on every Develop load→save cycle, because formatHtml kept the
 * text node's surrounding source whitespace while ALSO re-adding its own indent.
 * The save path (treeToHtml) preserved it, so it grew unbounded. formatHtml now
 * trims text nodes — so the stored HTML reaches a fixed point.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHtml, formatHtml, treeToHtml } from "./parse-html.ts";

// One Develop round-trip: stored HTML → editor (formatHtml) → save (treeToHtml).
function cycle(html: string): string {
  return treeToHtml(parseHtml(formatHtml(parseHtml(html))));
}

test("mixed text+element content does not grow whitespace across cycles", () => {
  const start = `<span class="eyebrow"><span class="h-px w-8 bg-green-500"></span>
        {{t eyebrow}}
      </span>`;
  const once = cycle(start);
  const twice = cycle(once);
  assert.equal(twice, once, "second cycle must equal the first (fixed point)");
  // And the slot text survived intact (only whitespace was normalized).
  assert.match(once, /\{\{t eyebrow\}\}/);
});

test("a leaf slot element stays on one line and is stable", () => {
  const start = `<h1>{{t title}}</h1>`;
  const once = cycle(start);
  assert.equal(once, `<h1>{{t title}}</h1>`);
  assert.equal(cycle(once), once);
});
