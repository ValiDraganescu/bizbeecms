/**
 * Pure test for the AI assistant inline page-context formatter.
 * The set/get module channel is trivial I/O; only the formatter has logic.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPageContext,
  summarizeBlock,
  formatMentionedSections,
} from "../src/lib/chat/page-context.ts";

// A Section → column → List(template) tree, like the real Restovista home page.
const restaurantSection = {
  id: "Section-1",
  component: "Section",
  props: { columns: 1, name: "Restaurants" },
  children: [
    {
      id: "col-1",
      component: "__section_column__",
      children: [
        {
          id: "List-1",
          component: "List",
          listSource: { collection: "content_restaurants", presentation: "combobox", labelField: "name" },
          children: [{ id: "List-1-tpl", component: "RestaurantOption", listRole: "template" }],
        },
      ],
    },
  ],
};

test("null/undefined → empty string (no page selected → nothing appended)", () => {
  assert.equal(formatPageContext(null), "");
  assert.equal(formatPageContext(undefined), "");
});

test("published page → context names id, path, slug, and published status", () => {
  const out = formatPageContext({ id: "pg_1", path: "/about", slug: "about", published: true });
  assert.match(out, /id: "pg_1"/);
  assert.match(out, /\/about/);
  assert.match(out, /slug: "about"/);
  assert.match(out, /status: published/);
});

test("context tells the model to use the id instead of list_pages/get_page", () => {
  const out = formatPageContext({ id: "pg_1", path: "/about", slug: "about", published: true });
  assert.match(out, /do NOT call list_pages or get_page/);
});

test("draft page → status reads draft", () => {
  const out = formatPageContext({ id: "pg_2", path: "/blog/post", slug: "post", published: false });
  assert.match(out, /\/blog\/post/);
  assert.match(out, /status: draft/);
});

test("base page context no longer inlines the section list (moved to per-mention)", () => {
  const out = formatPageContext({
    id: "pg_1",
    path: "/about",
    slug: "about",
    published: true,
    sections: [
      { id: "Section-1", name: "Hero", block: { id: "Section-1", component: "Section" } },
    ],
  });
  assert.doesNotMatch(out, /Section-1/);
  assert.doesNotMatch(out, /Sections on this page/);
});

test("summarizeBlock: nests every block id + component, surfaces List binding info", () => {
  const out = summarizeBlock(restaurantSection);
  assert.match(out, /Section \(id: Section-1\)/);
  assert.match(out, /__section_column__ \(id: col-1\)/);
  assert.match(out, /List \(id: List-1\)/);
  assert.match(out, /collection=content_restaurants/);
  assert.match(out, /presentation=combobox/);
  assert.match(out, /RestaurantOption \(id: List-1-tpl\)/);
});

test("formatMentionedSections: resolves a backticked @mention to its contents", () => {
  const sections = [{ id: "Section-1", name: "Restaurants", block: restaurantSection }];
  const out = formatMentionedSections("`@Restaurants` use name + rating", sections);
  assert.match(out, /Mentioned sections/);
  assert.match(out, /Section "Restaurants" \(id: Section-1\)/);
  assert.match(out, /List \(id: List-1\)/, "the nested List id is exposed so the model targets it");
});

test("formatMentionedSections: matches a bare @mention too", () => {
  const sections = [{ id: "Section-1", name: "Hero", block: restaurantSection }];
  assert.notEqual(formatMentionedSections("change @Hero title", sections), "");
});

test("formatMentionedSections: no match → empty string (nothing injected)", () => {
  const sections = [{ id: "Section-1", name: "Hero", block: restaurantSection }];
  assert.equal(formatMentionedSections("just a normal message", sections), "");
  assert.equal(formatMentionedSections("@Hero", []), "");
});

test("formatMentionedSections: word boundary — @Her does not match section 'Hero'", () => {
  const sections = [{ id: "Section-1", name: "Hero", block: restaurantSection }];
  assert.equal(formatMentionedSections("@Her", sections), "");
});
