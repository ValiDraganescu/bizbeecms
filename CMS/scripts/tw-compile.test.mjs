/**
 * Tests for the runtime Tailwind compiler (buildCss).
 * Run: node --test scripts/tw-compile.test.mjs
 *
 * This is the real new logic of the "any Tailwind class" change: prove that
 * compile() turns an explicit class list into CSS — including variants and
 * arbitrary values — with no oxide / no filesystem (the same path that runs in
 * the Cloudflare Worker). Imports tailwindcss from node_modules + the inlined
 * sources via Node type-stripping.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCss, splitClasses } from "../src/lib/render/tw-compile.ts";

test("empty class list yields empty CSS", async () => {
  assert.equal(await buildCss([]), "");
});

test("compiles plain utilities to real CSS", async () => {
  const css = await buildCss(["p-4", "text-2xl"]);
  assert.match(css, /\.p-4\s*\{/);
  assert.match(css, /\.text-2xl\s*\{/);
});

test("compiles variants (hover:, md:) the old allowlist rejected", async () => {
  const css = await buildCss(["hover:bg-red-500", "md:grid-cols-3"]);
  assert.match(css, /:hover/);
  assert.match(css, /@media/);
});

test("compiles arbitrary values (h-[37px], bg-[#abc123])", async () => {
  const css = await buildCss(["h-[37px]", "bg-[#abc123]"]);
  assert.ok(css.includes("37px"), "arbitrary length present");
  assert.ok(/#abc123/i.test(css), "arbitrary color present");
});

test("purpose color tokens resolve to var(--color-*) so the theme drives them", async () => {
  const css = await buildCss(["bg-primary", "text-foreground"]);
  assert.ok(css.includes("var(--color-primary)"), "bg-primary uses the token var");
  assert.ok(css.includes("var(--color-foreground)"), "text-foreground uses the token var");
});

test("order- and dedup-independent: same class set → identical CSS (cache key)", async () => {
  const a = await buildCss(["p-4", "p-4", "m-2"]);
  const b = await buildCss(["m-2", "p-4"]);
  assert.equal(a, b);
});

test("splitClasses handles strings and non-strings", () => {
  assert.deepEqual(splitClasses("  a  b\nc "), ["a", "b", "c"]);
  assert.deepEqual(splitClasses(undefined), []);
  assert.deepEqual(splitClasses(42), []);
});
