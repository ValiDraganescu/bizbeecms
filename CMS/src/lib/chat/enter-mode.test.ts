/**
 * ai-widget-ux — pure tests for the chat input Enter-behaviour decider.
 * Runs under `node --test`; storage helpers are guarded, not exercised here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSendOnEnter } from "./enter-mode.ts";

const NONE = { shift: false, meta: false, ctrl: false };

test("send mode: plain Enter sends", () => {
  assert.equal(decideSendOnEnter("send", NONE), true);
});

test("send mode: Shift+Enter is a newline (no send)", () => {
  assert.equal(decideSendOnEnter("send", { ...NONE, shift: true }), false);
});

test("send mode: Cmd/Ctrl+Enter still sends", () => {
  assert.equal(decideSendOnEnter("send", { ...NONE, meta: true }), true);
  assert.equal(decideSendOnEnter("send", { ...NONE, ctrl: true }), true);
});

test("newline mode: plain Enter is a newline (no send)", () => {
  assert.equal(decideSendOnEnter("newline", NONE), false);
});

test("newline mode: Cmd+Enter sends", () => {
  assert.equal(decideSendOnEnter("newline", { ...NONE, meta: true }), true);
});

test("newline mode: Ctrl+Enter sends", () => {
  assert.equal(decideSendOnEnter("newline", { ...NONE, ctrl: true }), true);
});

test("newline mode: Shift+Enter is a newline (no send)", () => {
  assert.equal(decideSendOnEnter("newline", { ...NONE, shift: true }), false);
});
