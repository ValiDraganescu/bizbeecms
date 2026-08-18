import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyCuratedPurposes, SEED_CURATED_PURPOSES } from "./curated.ts";
import { addCuratedModel, removeCuratedModel, updateCuratedModel } from "./curated-edit.ts";

test("add derives a deduped key from the label and appends by default", () => {
  const r = addCuratedModel(SEED_CURATED_PURPOSES, "chatAgent", { label: "Standard", model: "x/y" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.entry.key, "standard-2");
  assert.equal(r.entry.marginPct, 30);
  assert.deepEqual(r.purposes.chatAgent.models.map((m) => m.key), ["standard", "standard-2"]);
  // input untouched
  assert.equal(SEED_CURATED_PURPOSES.chatAgent.models.length, 1);
});

test("add at position 0 makes the alias the default; explicit key validated", () => {
  const r = addCuratedModel(SEED_CURATED_PURPOSES, "translate", { model: "a/b", key: "Fast", position: 0, marginPct: "10" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.purposes.translate.models[0].key, "fast");
  assert.equal(r.entry.label, "b");
  assert.equal(r.entry.marginPct, 10);
  assert.equal(addCuratedModel(SEED_CURATED_PURPOSES, "translate", { model: "a/b", key: "standard" }).ok, false);
  assert.equal(addCuratedModel(SEED_CURATED_PURPOSES, "translate", { model: "a/b", key: "Bad Key!" }).ok, false);
  assert.equal(addCuratedModel(SEED_CURATED_PURPOSES, "translate", { model: "" }).ok, false);
  assert.equal(addCuratedModel(SEED_CURATED_PURPOSES, "translate", { model: "a/b", marginPct: -1 }).ok, false);
});

test("update patches fields and can reorder", () => {
  const base = addCuratedModel(SEED_CURATED_PURPOSES, "assistant", { model: "a/b", key: "cheap" });
  assert.equal(base.ok, true);
  if (!base.ok) return;
  const r = updateCuratedModel(base.purposes, "assistant", "cheap", { label: "Cheap", position: 0 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.purposes.assistant.models.map((m) => m.key), ["cheap", "standard"]);
  assert.equal(r.entry.label, "Cheap");
  assert.equal(r.entry.model, "a/b");
  assert.equal(updateCuratedModel(base.purposes, "assistant", "nope", {}).ok, false);
  assert.equal(updateCuratedModel(base.purposes, "assistant", "cheap", { model: " " }).ok, false);
});

test("remove drops the alias; unknown key is an error", () => {
  const r = removeCuratedModel(SEED_CURATED_PURPOSES, "imageGenerate", "standard");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.purposes.imageGenerate.models, []);
  assert.equal(removeCuratedModel(emptyCuratedPurposes(), "imageGenerate", "standard").ok, false);
});
