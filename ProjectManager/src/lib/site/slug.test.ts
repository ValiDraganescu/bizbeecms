import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidSlug, slugify, slugifyTyping } from "./slug.ts";

test("slugify: lowercases, strips diacritics + punctuation, collapses to hyphens", () => {
  assert.equal(slugify("Taivaanranta Grill & Distillery"), "taivaanranta-grill-distillery");
  assert.equal(slugify("  Café Ülemiste — Tallinn!  "), "cafe-ulemiste-tallinn");
  assert.equal(slugify("---"), "");
  assert.equal(slugify("a".repeat(80)).length, 64);
});

test("slugifyTyping: keeps ONE trailing hyphen while typing, otherwise == slugify", () => {
  assert.equal(slugifyTyping("My Site"), "my-site");
  assert.equal(slugifyTyping("my-"), "my-");
  assert.equal(slugifyTyping("my "), "my-");
  assert.equal(slugifyTyping("my--"), "my-");
  assert.equal(slugifyTyping("Taivaanranta Grill & "), "taivaanranta-grill-");
  assert.equal(slugifyTyping("-"), "");
  assert.equal(slugifyTyping(""), "");
});

test("isValidSlug rejects what the typing helper can transiently produce", () => {
  assert.equal(isValidSlug("my-"), false);
  assert.equal(isValidSlug("my-site"), true);
  assert.equal(isValidSlug("My-Site"), false);
});
