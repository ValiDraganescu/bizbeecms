/**
 * ai-widget-ux — pure tests for the minimized-widget unread-badge decider.
 * Runs under `node --test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextUnread } from "./unread-badge.ts";

test("reply finishes while minimized → unread set", () => {
  assert.equal(nextUnread(false, { open: false, replyFinished: true }), true);
});

test("opening the panel clears unread", () => {
  assert.equal(nextUnread(true, { open: true, replyFinished: false }), false);
});

test("opening clears even if a reply finished the same tick", () => {
  assert.equal(nextUnread(true, { open: true, replyFinished: true }), false);
});

test("no reply, still minimized → flag unchanged", () => {
  assert.equal(nextUnread(true, { open: false, replyFinished: false }), true);
  assert.equal(nextUnread(false, { open: false, replyFinished: false }), false);
});

test("reply finishes while open → stays clear", () => {
  assert.equal(nextUnread(false, { open: true, replyFinished: true }), false);
});
