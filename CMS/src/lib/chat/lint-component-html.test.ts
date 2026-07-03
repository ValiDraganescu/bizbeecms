import { test } from "node:test";
import assert from "node:assert/strict";
import { lintComponentHtml, lintSlotsDeclared } from "./lint-component-html.ts";

// ── tag balance ───────────────────────────────────────────────────────────────

test("clean component html passes", () => {
  const html =
    `<section class="relative overflow-hidden bg-foreground">\n` +
    `  <img src="{{backgroundImage}}" alt="" class="absolute inset-0" />\n` +
    `  <div class="relative"><h1>{{t title}}</h1><p>{{t subtitle}}</p></div>\n` +
    `  <span>{{icon "search"}}</span>\n` +
    `  <LanguageSwitcher/>\n` +
    `</section>`;
  assert.deepEqual(lintComponentHtml(html), []);
});

test("unclosed tag is reported with line + fix", () => {
  const errors = lintComponentHtml(`<div>\n<p>hello\n</div>`);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /<p> \(opened line 2\)/);
  assert.match(errors[0], /add <\/p>/);
});

test("unclosed tag at end of input is reported", () => {
  const errors = lintComponentHtml(`<div><span>x</span>`);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /unclosed <div> \(opened line 1\)/);
});

test("stray closing tag is reported", () => {
  const errors = lintComponentHtml(`<div>x</div></section>`);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /stray closing tag <\/section>/);
});

test("void and self-closing tags need no closer; case-insensitive match", () => {
  assert.deepEqual(lintComponentHtml(`<DIV><img src="x"><br><Card/></div>`), []);
});

test("quoted attribute values may contain angle brackets", () => {
  assert.deepEqual(lintComponentHtml(`<img alt="a > b < c" src="x" />`), []);
});

test("comments are skipped even when they contain tags", () => {
  assert.deepEqual(lintComponentHtml(`<div><!-- <p> not real --></div>`), []);
});

// ── slot syntax ───────────────────────────────────────────────────────────────

test("valid slot forms pass", () => {
  assert.deepEqual(
    lintComponentHtml(`<a href="{{ctaHref}}">{{t ctaText}} {{icon "arrow-right"}} {{icon glyph}}</a>`),
    [],
  );
});

test("bad slot body names the token and the valid forms", () => {
  const errors = lintComponentHtml(`<p>{{title | upper}}</p>`);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /bad slot "\{\{title \| upper\}\}"/);
  assert.match(errors[0], /\{\{t prop\}\}/);
});

test("unclosed {{ is reported", () => {
  const errors = lintComponentHtml(`<p>{{title</p>`);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /unclosed "\{\{"/);
});

test("stray }} is reported", () => {
  const errors = lintComponentHtml(`<p>title}}</p>`);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /stray "\}\}"/);
});

// ── slot ↔ schema cross-check ─────────────────────────────────────────────────

const SCHEMA = JSON.stringify({
  title: { type: "string", default: "Hi" },
  glyph: { type: "icon", default: "star" },
});

test("declared slots pass; quoted icon literals need no declaration", () => {
  assert.deepEqual(
    lintSlotsDeclared(`<h1>{{t title}}</h1>{{icon glyph}}{{icon "search"}}`, SCHEMA),
    [],
  );
});

test("undeclared slot (plain and dynamic icon) is reported with the fix", () => {
  const errors = lintSlotsDeclared(`<h1>{{subtitle}}</h1><i>{{icon badge}}</i>`, SCHEMA);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /\{\{subtitle\}\} is not declared in propsSchema/);
  assert.match(errors[1], /\{\{badge\}\} is not declared/);
});
