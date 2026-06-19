/**
 * PAGE VERSIONING slice 1 — pure transition algebra tests (node --test).
 * Imports the REAL .ts (node strips types; `@/` won't resolve, so relative).
 * Covers the lifecycle the user spec'd: create-draft → edit → publish →
 * auto-draft → restore, plus version_no monotonicity.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDraftEdit,
  nextVersionNo,
  planDraftFrom,
  planPublish,
  planRestore,
} from "../src/lib/pages/page-version.ts";

/** Stamp a planner output into a full VersionRecord (what the store does). */
let seq = 0;
function stamp(planned) {
  seq += 1;
  return { ...planned, id: `v${seq}`, createdAt: 1000 + seq };
}

test("create-draft from nothing is empty", () => {
  const { record } = planDraftFrom("p1", null);
  assert.equal(record.status, "draft");
  assert.equal(record.versionNo, 0);
  assert.equal(record.blocks, "[]");
  assert.equal(record.meta, "{}");
  assert.equal(record.pageId, "p1");
});

test("create-draft from a source copies its blocks+meta", () => {
  const src = stamp(planDraftFrom("p1", null).record);
  const edited = applyDraftEdit(src, { blocks: '[{"id":"a"}]', meta: '{"en":"hi"}' });
  const { record } = planDraftFrom("p1", edited);
  assert.equal(record.blocks, '[{"id":"a"}]');
  assert.equal(record.meta, '{"en":"hi"}');
  assert.equal(record.status, "draft");
});

test("nextVersionNo ignores drafts and is monotonic over published", () => {
  const draft = stamp(planDraftFrom("p1", null).record);
  assert.equal(nextVersionNo([draft]), 1); // no published yet → 1
  const published1 = { ...draft, id: "x1", status: "published", versionNo: 1 };
  assert.equal(nextVersionNo([draft, published1]), 2);
  const published2 = { ...draft, id: "x2", status: "published", versionNo: 2 };
  assert.equal(nextVersionNo([draft, published1, published2]), 3);
  // another draft doesn't bump the sequence
  assert.equal(nextVersionNo([draft, published1, published2, { ...draft, id: "d2" }]), 3);
});

test("full lifecycle: create → edit → publish → auto-draft → restore", () => {
  // 1. create draft, edit it
  let draft = stamp(planDraftFrom("p1", null).record);
  draft = applyDraftEdit(draft, { blocks: '[{"id":"hero"}]', meta: '{"en":"v1"}' });

  // 2. publish → new published(version 1) + fresh auto-draft copied from it
  const pub1 = planPublish(draft, [draft]);
  const published1 = stamp(pub1.published);
  const autoDraft1 = stamp(pub1.autoDraft);
  assert.equal(published1.status, "published");
  assert.equal(published1.versionNo, 1);
  assert.equal(published1.blocks, '[{"id":"hero"}]'); // snapshot of the draft
  assert.equal(autoDraft1.status, "draft");
  assert.equal(autoDraft1.versionNo, 0);
  assert.equal(autoDraft1.blocks, published1.blocks); // auto-draft copies the snapshot

  // 3. edit the auto-draft and publish again → version 2, monotonic
  let draft2 = applyDraftEdit(autoDraft1, { blocks: '[{"id":"hero2"}]', meta: '{"en":"v2"}' });
  const pub2 = planPublish(draft2, [draft, published1, autoDraft1, draft2]);
  const published2 = stamp(pub2.published);
  assert.equal(published2.versionNo, 2);
  assert.equal(published2.blocks, '[{"id":"hero2"}]');

  // 4. restore version 1 → a NEW draft copying it, source untouched
  const restored = stamp(planRestore(published1).record);
  assert.equal(restored.status, "draft");
  assert.equal(restored.versionNo, 0);
  assert.equal(restored.blocks, published1.blocks);
  assert.notEqual(restored.id, published1.id); // a new row, not a mutation
  assert.equal(published1.blocks, '[{"id":"hero"}]'); // source unchanged
});

test("restore is non-destructive (does not mutate the source record)", () => {
  const src = stamp(applyDraftEdit(planDraftFrom("p1", null).record, { blocks: '["x"]', meta: "{}" }));
  const frozen = JSON.stringify(src);
  planRestore(src);
  assert.equal(JSON.stringify(src), frozen);
});
