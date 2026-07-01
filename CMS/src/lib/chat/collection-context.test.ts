/**
 * Pure tests for the Collections inline context formatter.
 * Runs under `node --test`; the module-level store/subscribers aren't exercised.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCollectionContext } from "./collection-context.ts";

test("null / nothing-to-say → empty string (nothing prepended)", () => {
  assert.equal(formatCollectionContext(null), "");
  assert.equal(formatCollectionContext(undefined), "");
  // No collections and none open → still nothing worth telling the model.
  assert.equal(formatCollectionContext({ collections: [], current: null }), "");
});

test("index page: lists collections, no open collection", () => {
  const out = formatCollectionContext({
    collections: [
      { name: "Restaurants", tableName: "content_restaurants" },
      { name: "Events", tableName: "content_events" },
    ],
    current: null,
  });
  assert.match(out, /Restaurants.*content_restaurants/);
  assert.match(out, /Events.*content_events/);
  assert.doesNotMatch(out, /viewing/); // no open collection
});

test("detail page: names the open collection + its fields with required flag", () => {
  const out = formatCollectionContext({
    collections: [{ name: "Restaurants", tableName: "content_restaurants" }],
    current: {
      name: "Restaurants",
      tableName: "content_restaurants",
      fields: [
        { name: "title", type: "string", required: true },
        { name: "rating", type: "number" },
      ],
    },
  });
  assert.match(out, /viewing the "Restaurants" collection/);
  assert.match(out, /title: string \(required\)/);
  assert.match(out, /rating: number/);
  assert.doesNotMatch(out, /rating: number \(required\)/); // optional stays unflagged
  assert.match(out, /add_collection_item/); // steers the model to the right tools
});
