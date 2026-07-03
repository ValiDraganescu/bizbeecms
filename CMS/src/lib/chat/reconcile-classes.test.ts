import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileComponentClasses } from "./reconcile-classes.ts";
import { parseHtml } from "../render/parse-html.ts";

const run = (html: string, css = "", script = "") =>
  reconcileComponentClasses(parseHtml(html), css, script);

test("real Tailwind classes (variants, arbitrary values, theme tokens) pass", async () => {
  const w = await run(
    `<div class="flex flex-col gap-2 hover:bg-primary md:pt-48 h-[37px] text-surface/80"><p class="text-sm">x</p></div>`,
  );
  assert.deepEqual(w, []);
});

test("typo class is flagged with the exact token", async () => {
  const w = await run(`<div class="felx p-4">x</div>`);
  assert.equal(w.length, 1);
  assert.match(w[0], /"felx" produces no styling/);
});

test("non-Tailwind class covered by the component css passes", async () => {
  assert.deepEqual(await run(`<div class="promo-glow">x</div>`, `.promo-glow { filter: blur(2px); }`), []);
});

test("non-Tailwind class referenced by the script passes (selection hook)", async () => {
  assert.deepEqual(
    await run(`<div class="carousel-root">x</div>`, "", `document.querySelector(".carousel-root")`),
    [],
  );
});

test("dead css rule is flagged; script-built classes are not", async () => {
  const css = `.dead-rule { color: red; } .built-later { color: blue; }`;
  const script = `el.className = "built-later";`;
  const w = await run(`<div class="p-4">x</div>`, css, script);
  assert.equal(w.length, 1);
  assert.match(w[0], /\.dead-rule.*nothing uses it/);
});

test("slot-bound class tokens are skipped", async () => {
  assert.deepEqual(await run(`<div class="p-4 {{extraClasses}}">x</div>`), []);
});
