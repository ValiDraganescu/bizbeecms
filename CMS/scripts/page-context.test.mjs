/**
 * Pure test for the AI assistant inline page-context formatter.
 * The set/get module channel is trivial I/O; only the formatter has logic.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { formatPageContext } from "../src/lib/chat/page-context.ts";

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
