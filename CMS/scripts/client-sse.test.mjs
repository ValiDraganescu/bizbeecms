// Dep-free node --test for the pure client-side chat SSE parser
// (`src/lib/chat/client-sse.ts`). Mirrors the project convention: no @/ alias,
// no React/DOM imports — import the .ts module directly via type-stripping.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ChatEventParser,
  parseFrame,
} from "../src/lib/chat/client-sse.ts";

// Build a frame exactly as the route's frameEvent does.
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

test("parseFrame: token frame yields text", () => {
  const ev = parseFrame("event: token\ndata: {\"text\":\"Hello\"}");
  assert.deepEqual(ev, { type: "token", text: "Hello" });
});

test("parseFrame: done frame", () => {
  assert.deepEqual(parseFrame("event: done\ndata: {}"), { type: "done" });
});

test("parseFrame: error frame", () => {
  const ev = parseFrame("event: error\ndata: {\"message\":\"boom\"}");
  assert.deepEqual(ev, { type: "error", message: "boom" });
});

test("parseFrame: error frame missing message falls back", () => {
  const ev = parseFrame("event: error\ndata: {}");
  assert.deepEqual(ev, { type: "error", message: "unknown error" });
});

test("parseFrame: tool success (component)", () => {
  const ev = parseFrame(
    "event: tool\ndata: " +
      JSON.stringify({ name: "create_component", ok: true, action: "created", component: "Hero" }),
  );
  assert.equal(ev.type, "tool");
  assert.equal(ev.result.ok, true);
  assert.equal(ev.result.component, "Hero");
  assert.equal(ev.result.action, "created");
});

test("parseFrame: tool failure carries errors[]", () => {
  const ev = parseFrame(
    "event: tool\ndata: " +
      JSON.stringify({ name: "create_page", ok: false, errors: ["bad slug", "no blocks"] }),
  );
  assert.equal(ev.result.ok, false);
  assert.deepEqual(ev.result.errors, ["bad slug", "no blocks"]);
});

test("parseFrame: tool with non-array errors → undefined", () => {
  const ev = parseFrame("event: tool\ndata: {\"name\":\"x\",\"ok\":false,\"errors\":\"oops\"}");
  assert.equal(ev.result.errors, undefined);
});

test("parseFrame: unknown event name → null", () => {
  assert.equal(parseFrame("event: weird\ndata: {}"), null);
});

test("parseFrame: no event line → null", () => {
  assert.equal(parseFrame("data: {\"text\":\"x\"}"), null);
});

test("parseFrame: token with non-string text → null", () => {
  assert.equal(parseFrame("event: token\ndata: {\"text\":42}"), null);
});

test("parseFrame: unparseable JSON → null (no throw)", () => {
  assert.equal(parseFrame("event: token\ndata: {not json"), null);
});

test("parseFrame: tolerates 'data:' without a space", () => {
  const ev = parseFrame("event:token\ndata:{\"text\":\"hi\"}");
  assert.deepEqual(ev, { type: "token", text: "hi" });
});

test("ChatEventParser: parses multiple whole frames in one chunk", () => {
  const p = new ChatEventParser();
  const evs = p.push(frame("token", { text: "a" }) + frame("token", { text: "b" }) + frame("done", {}));
  assert.deepEqual(evs.map((e) => e.type), ["token", "token", "done"]);
  assert.equal(evs[0].text, "a");
  assert.equal(evs[1].text, "b");
});

test("ChatEventParser: buffers a frame split across chunks", () => {
  const p = new ChatEventParser();
  const full = frame("token", { text: "split me" });
  const mid = Math.floor(full.length / 2);
  assert.deepEqual(p.push(full.slice(0, mid)), []); // partial → nothing yet
  const evs = p.push(full.slice(mid));
  assert.deepEqual(evs, [{ type: "token", text: "split me" }]);
});

test("ChatEventParser: a full token+tool+done stream split arbitrarily", () => {
  const p = new ChatEventParser();
  const stream =
    frame("token", { text: "Build" }) +
    frame("token", { text: "ing" }) +
    frame("tool", { name: "create_component", ok: true, action: "created", component: "Card" }) +
    frame("done", {});
  // Feed it one character at a time — the worst-case split.
  const collected = [];
  for (const ch of stream) collected.push(...p.push(ch));
  collected.push(...p.flush());
  assert.deepEqual(
    collected.map((e) => e.type),
    ["token", "token", "tool", "done"],
  );
  assert.equal(collected[2].result.component, "Card");
});

test("ChatEventParser: flush drains a final frame with no trailing blank line", () => {
  const p = new ChatEventParser();
  assert.deepEqual(p.push("event: done\ndata: {}"), []); // no \n\n yet
  assert.deepEqual(p.flush(), [{ type: "done" }]);
});
