/**
 * bulk-translate-missing page-builder adapter (node --test; no @/ imports):
 * entry derivation from meta + block tree, slot splitting, and vetted
 * application back into meta maps / draft blocks. Pure — no fetch, no React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pageTranslateEntries,
  splitPageSlots,
  mergePageMeta,
  applyBlockTranslations,
  type PageMeta,
} from "./page-translate-missing.ts";
import type { Block } from "../render/tree.ts";
import type { ContentLocales } from "../render/localize.ts";

const LOCALES: ContentLocales = { default: "en", locales: ["en", "fi", "et"] };
const SINGLE: ContentLocales = { default: "en", locales: ["en"] };

const HERO_SCHEMA = JSON.stringify({
  title: { type: "string", translatable: true },
  body: { type: "richtext", translatable: true },
  imageUrl: { type: "string" }, // not translatable
  count: { type: "number", translatable: true }, // scalar — translatable ignored
});
const SCHEMAS = { Hero: HERO_SCHEMA, Card: HERO_SCHEMA };

const META_NONE: PageMeta = { metaTitle: {}, metaDescription: {} };

/** A Section → row → column → leaf tree around `leaves` (the real page shape). */
function tree(...leaves: Block[]): Block[] {
  return [
    {
      id: "s1",
      component: "__section__",
      children: [
        {
          id: "r1",
          component: "__section_row__",
          children: [{ id: "c1", component: "__section_column__", children: leaves }],
        },
      ],
    },
  ];
}

// ── pageTranslateEntries ─────────────────────────────────────────────────────

test("meta maps: missing locales become metaTitle/metaDescription entries", () => {
  const meta: PageMeta = {
    metaTitle: { en: "Home", fi: "Koti" },
    metaDescription: { en: "Welcome" },
  };
  assert.deepEqual(pageTranslateEntries(meta, [], {}, LOCALES), [
    { name: "metaTitle", sourceText: "Home", targetLocales: ["et"] },
    { name: "metaDescription", sourceText: "Welcome", targetLocales: ["fi", "et"] },
  ]);
});

test("meta without default-locale source yields no entry (AC8)", () => {
  const meta: PageMeta = { metaTitle: { fi: "Koti" }, metaDescription: {} };
  assert.deepEqual(pageTranslateEntries(meta, [], {}, LOCALES), []);
});

test("block props: bare string / partial locale object / complete / unset", () => {
  const blocks = tree({
    id: "b1",
    component: "Hero",
    props: {
      title: "Hello", // bare string → default-only → fi+et missing
      body: { en: "Text", fi: "Teksti" }, // et missing
      imageUrl: "https://x/y.png", // not translatable → never an entry
    },
  });
  assert.deepEqual(pageTranslateEntries(META_NONE, blocks, SCHEMAS, LOCALES), [
    { name: "b1.title", sourceText: "Hello", targetLocales: ["fi", "et"] },
    { name: "b1.body", sourceText: "Text", targetLocales: ["et"] },
  ]);
});

test("unset props and unknown/builtin components yield no entries", () => {
  const blocks = tree(
    { id: "b1", component: "Hero" }, // no props at all
    { id: "b2", component: "Unknown", props: { title: "Hi" } }, // no schema
    { id: "b3", component: "__list__", props: { title: "Hi" } }, // builtin
  );
  assert.deepEqual(pageTranslateEntries(META_NONE, blocks, SCHEMAS, LOCALES), []);
});

test("nested children (List template) are walked at any depth", () => {
  const blocks = tree({
    id: "list1",
    component: "__list__",
    children: [{ id: "b9", component: "Card", props: { title: "Item" } }],
  });
  assert.deepEqual(pageTranslateEntries(META_NONE, blocks, SCHEMAS, LOCALES), [
    { name: "b9.title", sourceText: "Item", targetLocales: ["fi", "et"] },
  ]);
});

test("single-locale site plans nothing (AC10)", () => {
  const meta: PageMeta = { metaTitle: { en: "Home" }, metaDescription: {} };
  const blocks = tree({ id: "b1", component: "Hero", props: { title: "Hello" } });
  assert.deepEqual(pageTranslateEntries(meta, blocks, SCHEMAS, SINGLE), []);
});

// ── splitPageSlots ───────────────────────────────────────────────────────────

test("splitPageSlots separates meta names from block paths", () => {
  const { meta, block } = splitPageSlots({
    metaTitle: { fi: "Koti" },
    "b1.title": { fi: "Hei" },
    metaDescription: { et: "Tere" },
  });
  assert.deepEqual(meta, { metaTitle: { fi: "Koti" }, metaDescription: { et: "Tere" } });
  assert.deepEqual(block, { "b1.title": { fi: "Hei" } });
});

// ── mergePageMeta ────────────────────────────────────────────────────────────

test("mergePageMeta adds slots and keeps every existing locale text", () => {
  const meta: PageMeta = {
    metaTitle: { en: "Home", fi: "Koti" },
    metaDescription: { en: "Welcome" },
  };
  assert.deepEqual(mergePageMeta(meta, { metaTitle: { et: "Kodu" } }), {
    metaTitle: { en: "Home", fi: "Koti", et: "Kodu" },
    metaDescription: { en: "Welcome" },
  });
});

// ── applyBlockTranslations ───────────────────────────────────────────────────

test("applies only the addressed slots, preserving existing locales + siblings", () => {
  const blocks = tree({
    id: "b1",
    component: "Hero",
    props: {
      title: { en: "Hello", fi: "Hei" },
      body: "Text",
      imageUrl: "https://x/y.png",
    },
  });
  const next = applyBlockTranslations(
    blocks,
    { "b1.title": { et: "Tere" }, "b1.body": { fi: "Teksti", et: "Tekst" } },
    SCHEMAS,
    LOCALES,
  );
  const leaf = next[0].children![0].children![0].children![0];
  assert.deepEqual(leaf.props?.title, { en: "Hello", fi: "Hei", et: "Tere" });
  assert.deepEqual(leaf.props?.body, { en: "Text", fi: "Teksti", et: "Tekst" });
  // Sibling non-translatable prop survives the full-schema re-validation.
  assert.equal(leaf.props?.imageUrl, "https://x/y.png");
});

test("no matching slots returns the SAME array/blocks (nothing to autosave)", () => {
  const blocks = tree({ id: "b1", component: "Hero", props: { title: "Hello" } });
  const next = applyBlockTranslations(
    blocks,
    { metaTitle: { fi: "Koti" }, "gone.title": { fi: "Hei" } }, // meta + stale id
    SCHEMAS,
    LOCALES,
  );
  assert.equal(next, blocks);
});

test("untouched sibling blocks keep their reference; touched subtree is new", () => {
  const a: Block = { id: "b1", component: "Hero", props: { title: "Hello" } };
  const b: Block = { id: "b2", component: "Card", props: { title: { en: "X", fi: "X", et: "X" } } };
  const blocks = tree(a, b);
  const next = applyBlockTranslations(blocks, { "b1.title": { fi: "Hei" } }, SCHEMAS, LOCALES);
  assert.notEqual(next, blocks);
  const col = next[0].children![0].children![0];
  assert.deepEqual(col.children![0].props?.title, { en: "Hello", fi: "Hei" });
  assert.equal(col.children![1], b); // sibling untouched by reference
});
