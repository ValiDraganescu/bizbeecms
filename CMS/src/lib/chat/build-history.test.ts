/**
 * ai-widget-ux — the export path (chat-debug-panel) runs the transcript through
 * buildModelHistory, then the export route validates it with parseChatBody. These
 * guard the contract: a tool card must export as a structured tool_call + a paired
 * role:"tool" result, and that payload must pass the server parser — i.e. full
 * tool-call/result visibility survives the export round-trip. Runs under `node --test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModelHistory } from "./build-history.ts";
import { parseChatBody } from "./sse.ts";

test("buildModelHistory expands a tool card into tool_calls + a paired tool result", () => {
  const out = buildModelHistory(
    [
      { role: "user", content: "list the pages" },
      {
        role: "assistant",
        content: "",
        tools: [
          {
            id: "call_abc",
            name: "list_pages",
            ok: true,
            input: { limit: 10 },
            output: { pages: ["home", "about"] },
          },
        ],
      },
    ],
    "",
  );

  const assistant = out.find((m) => m.role === "assistant");
  const tool = out.find((m) => m.role === "tool");

  assert.deepEqual(assistant?.tool_calls?.[0], {
    id: "call_abc",
    type: "function",
    function: { name: "list_pages", arguments: JSON.stringify({ limit: 10 }) },
  });
  // The tool RESULT (output) is carried, not dropped — this is the visibility fix.
  assert.equal(tool?.tool_call_id, "call_abc");
  assert.match(String(tool?.content), /about/);

  // And the whole payload passes the server validator the export route uses.
  const parsed = parseChatBody({ messages: out });
  assert.equal("error" in parsed, false);
});

test("buildModelHistory carries a failed tool card's errors, with a paired synthesized id", () => {
  const out = buildModelHistory(
    [
      { role: "user", content: "make a bad page" },
      {
        role: "assistant",
        content: "",
        tools: [{ name: "create_page", ok: false, errors: ["slug required"] }],
      },
    ],
    "",
  );

  const assistant = out.find((m) => m.role === "assistant");
  const tool = out.find((m) => m.role === "tool");
  assert.match(String(tool?.content), /slug required/);
  // A card with no provider id still pairs both sides on a synthesized id.
  assert.equal(tool?.tool_call_id, assistant?.tool_calls?.[0].id);
});
