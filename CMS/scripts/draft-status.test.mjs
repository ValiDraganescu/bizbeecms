import { test } from "node:test";
import assert from "node:assert/strict";
import { nextDraftStatus, draftStatusKey } from "../src/lib/pages/draft-status.ts";

test("edit moves any state to dirty (even mid-save)", () => {
  assert.equal(nextDraftStatus("saved", "edit"), "dirty");
  assert.equal(nextDraftStatus("saving", "edit"), "dirty");
  assert.equal(nextDraftStatus("published", "edit"), "dirty");
});

test("save lifecycle: dirty → saving → saved", () => {
  let s = "dirty";
  s = nextDraftStatus(s, "saveStart");
  assert.equal(s, "saving");
  s = nextDraftStatus(s, "saveDone");
  assert.equal(s, "saved");
});

test("publish moves to published; loaded resets to saved", () => {
  assert.equal(nextDraftStatus("saving", "publishDone"), "published");
  assert.equal(nextDraftStatus("error", "loaded"), "saved");
});

test("error is sticky until next action", () => {
  assert.equal(nextDraftStatus("saving", "error"), "error");
  assert.equal(nextDraftStatus("error", "saveStart"), "saving");
});

test("status keys map to i18n keys", () => {
  assert.equal(draftStatusKey("saving"), "saving");
  assert.equal(draftStatusKey("saved"), "saved");
  assert.equal(draftStatusKey("published"), "published");
  assert.equal(draftStatusKey("dirty"), "unsaved");
  assert.equal(draftStatusKey("error"), "error");
});
