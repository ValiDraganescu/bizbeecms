import test from "node:test";
import assert from "node:assert/strict";
import { mutatesRenderedPage } from "../src/lib/chat/page-mutation-signal.ts";

test("page/component/theme writes that succeed trigger a reload", () => {
  for (const name of [
    "update_page_blocks",
    "bind_component",
    "create_list",
    "bind_list",
    "create_component",
    "update_component",
    "edit_text",
    "update_brand_identity",
    "update_theme",
  ]) {
    assert.equal(mutatesRenderedPage(name, true), true, name);
  }
});

test("a failed call never triggers a reload", () => {
  assert.equal(mutatesRenderedPage("update_page_blocks", false), false);
});

test("read-only / unrelated tools don't trigger a reload", () => {
  for (const name of ["list_pages", "get_page", "query_collection", "translate", "list_prompts"]) {
    assert.equal(mutatesRenderedPage(name, true), false, name);
  }
});
