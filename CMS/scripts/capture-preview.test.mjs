/**
 * Dep-free tests for the pure bits of the "send preview to AI" feature.
 * Run: node --test scripts/capture-preview.test.mjs
 *
 * The DOM capture itself (offscreen iframe + modern-screenshot) is browser-only
 * and not unit-tested; what's worth a check is the file-name label and the bus's
 * buffer-and-replay (a batch emitted with no subscriber must reach the next one).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { previewCaptureName, CAPTURE_VIEWPORTS } from "../src/lib/chat/capture-preview.ts";

test("previewCaptureName labels the file with component + viewport + width", () => {
  const vp = CAPTURE_VIEWPORTS.find((v) => v.id === "mobile");
  assert.equal(previewCaptureName("Hero", vp), "Hero — Mobile (375px).png");
});

test("the three offered viewports are desktop/tablet/mobile at the page-builder widths", () => {
  assert.deepEqual(
    CAPTURE_VIEWPORTS.map((v) => [v.id, v.width]),
    [
      ["desktop", 1280],
      ["tablet", 768],
      ["mobile", 375],
    ],
  );
});

test("attach bus buffers a batch emitted with no subscriber and replays it on subscribe", async () => {
  globalThis.window = {}; // shim so emit isn't a no-op (it only guards on window)
  const { emitChatAttachments, subscribeChatAttachments } = await import(
    "../src/lib/chat/chat-attach-bus.ts"
  );
  const batch = { images: [{ dataUrl: "data:image/png;base64,AA", name: "x.png", mime: "image/png" }] };

  // No subscriber yet → buffered.
  emitChatAttachments(batch);
  let got = null;
  const unsub = subscribeChatAttachments((b) => (got = b));
  assert.equal(got, batch, "buffered batch replays to the first subscriber");

  // Buffer is consumed once — a second subscriber gets nothing buffered.
  let second = null;
  subscribeChatAttachments((b) => (second = b));
  assert.equal(second, null, "buffer is cleared after first replay");

  // With a live subscriber, emit delivers directly (not buffered).
  let live = null;
  subscribeChatAttachments((b) => (live = b));
  emitChatAttachments(batch);
  assert.equal(live, batch, "direct delivery when a subscriber is mounted");
  unsub();
  delete globalThis.window;
});
