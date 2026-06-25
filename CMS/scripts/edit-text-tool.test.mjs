/**
 * Pure tests for the edit_text arg validator (the store/apply logic is tested in
 * apply-edit.test.mjs and exercised via the dispatch handler at runtime).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateEditText, EDIT_TEXT_TARGETS } from "../src/lib/chat/edit-text-tool.ts";

test("rejects an unknown target", () => {
  assert.ok("error" in validateEditText({ target: "page.blocks", name: "x", oldString: "a", newString: "b" }));
});

test("component target requires name", () => {
  assert.ok("error" in validateEditText({ target: "component.script", oldString: "a", newString: "b" }));
  const ok = validateEditText({ target: "component.css", name: "Hero", oldString: "a", newString: "b" });
  assert.ok(!("error" in ok));
  assert.equal(ok.selector, "Hero");
});

test("prompt target requires id (not name)", () => {
  assert.ok("error" in validateEditText({ target: "prompt.prompt", name: "Hero", oldString: "a", newString: "b" }));
  const ok = validateEditText({ target: "prompt.prompt", id: " pv1 ", oldString: "a", newString: "b" });
  assert.ok(!("error" in ok));
  assert.equal(ok.selector, "pv1");
});

test("oldString must be non-empty; newString must be a string", () => {
  assert.ok("error" in validateEditText({ target: "component.script", name: "Hero", oldString: "", newString: "b" }));
  assert.ok("error" in validateEditText({ target: "component.script", name: "Hero", oldString: "a" }));
});

test("replaceAll defaults to false and is read as boolean", () => {
  const a = validateEditText({ target: "component.script", name: "Hero", oldString: "a", newString: "b" });
  assert.equal(a.replaceAll, false);
  const b = validateEditText({ target: "component.script", name: "Hero", oldString: "a", newString: "b", replaceAll: true });
  assert.equal(b.replaceAll, true);
});

test("the three editable targets are exactly the fixed long-text fields", () => {
  assert.deepEqual([...EDIT_TEXT_TARGETS], ["component.script", "component.css", "prompt.prompt"]);
});
