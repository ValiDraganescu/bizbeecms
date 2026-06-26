import { describe, it, expect } from "vitest";
import { buildModelHistory } from "./build-history";
import { parseChatBody } from "./sse";

// The export path (chat-debug-panel) runs the transcript through buildModelHistory,
// then the export route validates it with parseChatBody. This guards the contract:
// a tool card must export as a structured tool_call + a paired role:"tool" result,
// and that payload must pass the server parser — i.e. full tool visibility survives.
describe("buildModelHistory → parseChatBody (export round-trip)", () => {
  it("expands an assistant tool card into tool_calls + a paired tool result", () => {
    const transcript = [
      { role: "user" as const, content: "list the pages" },
      {
        role: "assistant" as const,
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
    ];

    const out = buildModelHistory(transcript, "");

    const assistant = out.find((m) => m.role === "assistant");
    const tool = out.find((m) => m.role === "tool");
    expect(assistant?.tool_calls?.[0]).toMatchObject({
      id: "call_abc",
      type: "function",
      function: { name: "list_pages", arguments: JSON.stringify({ limit: 10 }) },
    });
    // The tool RESULT (output) is carried, not dropped — this is the visibility fix.
    expect(tool?.tool_call_id).toBe("call_abc");
    expect(tool?.content).toContain("about");

    // And the whole thing passes the server validator the export route uses.
    const parsed = parseChatBody({ messages: out });
    expect("error" in parsed).toBe(false);
  });

  it("carries a failed tool card's errors into the tool result", () => {
    const out = buildModelHistory(
      [
        { role: "user" as const, content: "make a bad page" },
        {
          role: "assistant" as const,
          content: "",
          tools: [{ name: "create_page", ok: false, errors: ["slug required"] }],
        },
      ],
      "",
    );
    const tool = out.find((m) => m.role === "tool");
    expect(tool?.content).toContain("slug required");
    // A card with no provider id still gets a synthesized id paired on both sides.
    const assistant = out.find((m) => m.role === "assistant");
    expect(tool?.tool_call_id).toBe(assistant?.tool_calls?.[0].id);
  });
});
