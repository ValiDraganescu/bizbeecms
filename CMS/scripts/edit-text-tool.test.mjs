/**
 * Pure tests for edit_text: the arg validator (targets + selectors + the two
 * edit modes) and the replaceBetween engine (applyBetween + near-miss quoting
 * in apply-edit.ts). The oldString cascade is tested in apply-edit.test.mjs;
 * store wiring is exercised via the dispatch handler at runtime.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateEditText, EDIT_TEXT_TARGET_FORMS } from "../src/lib/chat/edit-text-tool.ts";
import { applyBetween, nearestNearMiss } from "../src/lib/chat/apply-edit.ts";

// ── target + selector validation ──────────────────────────────────────────────

test("rejects an unknown target, listing the valid forms", () => {
  const r = validateEditText({ target: "page.blocks", name: "x", oldString: "a", newString: "b" });
  assert.ok("error" in r);
  assert.match(r.error, /component\.html/);
  assert.match(r.error, /collection_item\.<field>/);
});

test("component target requires name", () => {
  assert.ok("error" in validateEditText({ target: "component.script", oldString: "a", newString: "b" }));
  const ok = validateEditText({ target: "component.css", name: "Hero", oldString: "a", newString: "b" });
  assert.ok(!("error" in ok));
  assert.deepEqual(ok.spec, { kind: "component", field: "css", name: "Hero" });
});

test("prompt target requires id (not name)", () => {
  assert.ok("error" in validateEditText({ target: "prompt.prompt", name: "Hero", oldString: "a", newString: "b" }));
  const ok = validateEditText({ target: "prompt.prompt", id: " pv1 ", oldString: "a", newString: "b" });
  assert.ok(!("error" in ok));
  assert.deepEqual(ok.spec, { kind: "prompt", id: "pv1" });
});

test("chat_agent.systemPrompt requires agent", () => {
  const missing = validateEditText({ target: "chat_agent.systemPrompt", oldString: "a", newString: "b" });
  assert.ok("error" in missing);
  assert.match(missing.error, /agent/);
  const ok = validateEditText({ target: "chat_agent.systemPrompt", agent: "Booking Assistant", oldString: "a", newString: "b" });
  assert.ok(!("error" in ok));
  assert.deepEqual(ok.spec, { kind: "agent_prompt", agent: "Booking Assistant" });
});

test("chat_agent.welcomeMessage requires a locale in the target", () => {
  const bare = validateEditText({ target: "chat_agent.welcomeMessage", agent: "Bot", oldString: "a", newString: "b" });
  assert.ok("error" in bare);
  assert.match(bare.error, /chat_agent\.welcomeMessage\.<locale>/);
  const bad = validateEditText({ target: "chat_agent.welcomeMessage.nope!", agent: "Bot", oldString: "a", newString: "b" });
  assert.ok("error" in bad);
  assert.match(bad.error, /not a locale code/);
});

test("chat_agent.welcomeMessage.<locale> normalizes the locale and requires agent", () => {
  assert.ok("error" in validateEditText({ target: "chat_agent.welcomeMessage.en", oldString: "a", newString: "b" }));
  const ok = validateEditText({ target: "chat_agent.welcomeMessage.PT-BR", agent: "Bot", oldString: "a", newString: "b" });
  assert.ok(!("error" in ok));
  assert.deepEqual(ok.spec, { kind: "agent_welcome", agent: "Bot", locale: "pt-br" });
});

test("data_request.bodyTemplate requires source AND request", () => {
  const noSource = validateEditText({ target: "data_request.bodyTemplate", request: "r1", oldString: "a", newString: "b" });
  assert.ok("error" in noSource);
  assert.match(noSource.error, /source/);
  const noRequest = validateEditText({ target: "data_request.bodyTemplate", source: "s1", oldString: "a", newString: "b" });
  assert.ok("error" in noRequest);
  assert.match(noRequest.error, /request/);
  const ok = validateEditText({ target: "data_request.bodyTemplate", source: "TableOnline", request: "book", oldString: "a", newString: "b" });
  assert.ok(!("error" in ok));
  assert.deepEqual(ok.spec, { kind: "request_body", source: "TableOnline", request: "book" });
});

test("collection_item requires the field in the target plus collection + id args", () => {
  const bare = validateEditText({ target: "collection_item", collection: "content_x", id: "i1", oldString: "a", newString: "b" });
  assert.ok("error" in bare);
  assert.match(bare.error, /collection_item\.<field>/);
  assert.ok("error" in validateEditText({ target: "collection_item.description", id: "i1", oldString: "a", newString: "b" }));
  assert.ok("error" in validateEditText({ target: "collection_item.description", collection: "content_x", oldString: "a", newString: "b" }));
  const ok = validateEditText({ target: "collection_item.description", collection: "content_x", id: "i1", oldString: "a", newString: "b" });
  assert.ok(!("error" in ok));
  assert.deepEqual(ok.spec, { kind: "item_field", collection: "content_x", id: "i1", field: "description" });
});

test("the documented target forms are exactly the editable fields", () => {
  assert.deepEqual(
    [...EDIT_TEXT_TARGET_FORMS],
    [
      "component.html",
      "component.script",
      "component.css",
      "prompt.prompt",
      "chat_agent.systemPrompt",
      "chat_agent.welcomeMessage.<locale>",
      "data_request.bodyTemplate",
      "collection_item.<field>",
    ],
  );
});

// ── edit-mode validation ──────────────────────────────────────────────────────

test("oldString must be non-empty; newString must be a string", () => {
  assert.ok("error" in validateEditText({ target: "component.script", name: "Hero", oldString: "", newString: "b" }));
  assert.ok("error" in validateEditText({ target: "component.script", name: "Hero", oldString: "a" }));
});

test("replaceAll defaults to false and is read as boolean", () => {
  const a = validateEditText({ target: "component.script", name: "Hero", oldString: "a", newString: "b" });
  assert.equal(a.edit.replaceAll, false);
  const b = validateEditText({ target: "component.script", name: "Hero", oldString: "a", newString: "b", replaceAll: true });
  assert.equal(b.edit.replaceAll, true);
});

test("mode args are mutually exclusive, and one mode is required", () => {
  const both = validateEditText({ target: "prompt.prompt", id: "pv1", oldString: "a", start: "s", end: "e", newString: "b" });
  assert.ok("error" in both);
  assert.match(both.error, /not args from both/);
  const neither = validateEditText({ target: "prompt.prompt", id: "pv1", newString: "b" });
  assert.ok("error" in neither);
  assert.match(neither.error, /oldString.*replace mode.*start.*end/);
});

test("replaceBetween args validate: non-empty markers, integer occurrence ≥ 1", () => {
  assert.ok("error" in validateEditText({ target: "prompt.prompt", id: "pv1", start: "", end: "e", newString: "b" }));
  assert.ok("error" in validateEditText({ target: "prompt.prompt", id: "pv1", start: "s", newString: "b" }));
  assert.ok("error" in validateEditText({ target: "prompt.prompt", id: "pv1", start: "s", end: "e", newString: "b", occurrence: 0 }));
  assert.ok("error" in validateEditText({ target: "prompt.prompt", id: "pv1", start: "s", end: "e", newString: "b", occurrence: 1.5 }));
  const ok = validateEditText({ target: "prompt.prompt", id: "pv1", start: "s", end: "e", newString: "b" });
  assert.ok(!("error" in ok));
  assert.deepEqual(ok.edit, { mode: "between", start: "s", end: "e", newString: "b", inclusive: false, occurrence: null });
});

test("replaceBetween inclusive + occurrence parse through", () => {
  const ok = validateEditText({ target: "prompt.prompt", id: "pv1", start: "s", end: "e", newString: "b", inclusive: true, occurrence: 2 });
  assert.ok(!("error" in ok));
  assert.equal(ok.edit.inclusive, true);
  assert.equal(ok.edit.occurrence, 2);
});

// ── applyBetween engine ───────────────────────────────────────────────────────

test("applyBetween default keeps the markers and replaces only the span between", () => {
  const r = applyBetween("head [A] middle [B] tail", "[A]", "[B]", " NEW ");
  assert.equal(r.ok, true);
  assert.equal(r.content, "head [A] NEW [B] tail");
  assert.equal(r.replacements, 1);
  assert.equal(r.matcher, "between-exact");
});

test("applyBetween inclusive replaces the markers too", () => {
  const r = applyBetween("head [A] middle [B] tail", "[A]", "[B]", "NEW", { inclusive: true });
  assert.equal(r.ok, true);
  assert.equal(r.content, "head NEW tail");
});

test("applyBetween uses the FIRST end after the chosen start", () => {
  const r = applyBetween("x END a START b END c END", "START", "END", "-");
  assert.equal(r.ok, true);
  assert.equal(r.content, "x END a START-END c END");
});

test("ambiguous start without occurrence errors with the match count", () => {
  const r = applyBetween("S a E S b E", "S", "E", "-");
  assert.equal(r.ok, false);
  assert.match(r.error, /matches 2 times/);
  assert.match(r.error, /occurrence/);
});

test("occurrence picks the n-th start match; out of range errors with the count", () => {
  const ok = applyBetween("S a E S b E", "S", "E", "-", { occurrence: 2 });
  assert.equal(ok.ok, true);
  assert.equal(ok.content, "S a E S-E");
  const bad = applyBetween("S a E S b E", "S", "E", "-", { occurrence: 3 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /occurrence 3 is out of range/);
  assert.match(bad.error, /matches 2 times/);
});

test("end only BEFORE start errors (end must follow the start marker)", () => {
  const r = applyBetween("E then S and nothing after", "S", "E", "-");
  assert.equal(r.ok, false);
  assert.match(r.error, /end marker not found after the chosen start/);
});

test("start-not-found quotes the nearest near-miss from the text", () => {
  const r = applyBetween("You are the   Booking Assistant.", "the Booking Assistant", "END", "-");
  assert.equal(r.ok, false);
  assert.match(r.error, /start marker not found/);
  assert.match(r.error, /nearest near-miss/);
  assert.ok(r.error.includes("Booking Assistant"));
});

test("end-not-found-after-start quotes a near-miss from the text AFTER start", () => {
  const r = applyBetween("S then closing   remarks here", "S", "closing remarks", "-");
  assert.equal(r.ok, false);
  assert.match(r.error, /end marker not found after/);
  assert.match(r.error, /nearest near-miss/);
});

test("no near-miss → plain not-found error without a bogus quote", () => {
  const r = applyBetween("completely unrelated text", "zzz-marker", "E", "-");
  assert.equal(r.ok, false);
  assert.equal(r.error, "start marker not found in the text");
});

test("nearestNearMiss finds a whitespace-drifted span and clips long quotes", () => {
  assert.equal(nearestNearMiss("a  b  c", "a b c"), "a  b  c");
  assert.equal(nearestNearMiss("nothing here", "absent-needle"), null);
  const long = "x".repeat(400);
  const near = nearestNearMiss(long, "X" + "x".repeat(200));
  assert.ok(near !== null && near.length <= 160);
});
