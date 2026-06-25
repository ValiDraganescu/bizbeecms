/**
 * Build the MODEL-facing message history from the on-screen transcript.
 *
 * The wire contract to `/api/chat` is an OpenAI-compatible message list (see
 * `parseChatBody`). An assistant turn can be PURE tool calls with no streamed
 * text (e.g. a discovery round that only ran list_components/list_pages). To
 * continue such a conversation correctly, the history must replay the STRUCTURED
 * tool protocol that OpenAI- and Claude-family models expect:
 *
 *   { role:"assistant", content, tool_calls:[{id, type:"function", function:{name, arguments}}] }
 *   { role:"tool", tool_call_id:<same id>, name, content:<JSON result> }   (one per call)
 *
 * The `tool_call_id` MUST match the assistant `tool_calls[].id` — Claude rejects a
 * tool_result with no matching tool_use, and OpenAI rejects an orphan tool message.
 * We round-trip the provider's real call id (stored on each tool card); a card
 * from before ids were stored gets a stable synthesized id so the pairing still
 * holds. PURE (no React/D1/network) → node-testable.
 */

/** A transcript tool card — the client `ToolResult` shape, but only the bits we replay. */
export interface HistoryTool {
  id?: unknown;
  name?: unknown;
  ok?: unknown;
  input?: unknown;
  output?: unknown;
  errors?: unknown;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  tools?: HistoryTool[];
}

/** One OpenAI-compatible tool call on an assistant turn. */
export interface OutToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** An OpenAI-compatible message in the history we POST. */
export interface OutMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OutToolCall[];
  tool_call_id?: string;
  name?: string;
}

function jsonString(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

/** The result content fed back for a tool card: its output, or its errors on failure. */
function toolResultContent(t: HistoryTool): string {
  if (t.ok === false) {
    const errs = Array.isArray(t.errors)
      ? t.errors.filter((e): e is string => typeof e === "string")
      : [];
    return jsonString({ ok: false, errors: errs });
  }
  return jsonString(t.output ?? { ok: true });
}

/**
 * Flatten the transcript into the OpenAI-compatible history POSTed to /api/chat.
 * `nextUserContent` is the new message being sent (already inline-context-prefixed);
 * it's appended as the final user turn.
 *
 * An assistant turn with tools becomes a structured `assistant{tool_calls}` plus one
 * `role:"tool"` result per call (ids paired). A plain assistant turn stays as text.
 * An assistant turn with neither text nor tools is dropped (nothing happened).
 */
export function buildModelHistory(
  transcript: ReadonlyArray<HistoryMessage>,
  nextUserContent: string,
): OutMessage[] {
  const out: OutMessage[] = [];
  let turnIndex = 0;

  for (const m of transcript) {
    if (m.role === "user") {
      const c = m.content.trim();
      if (c !== "") out.push({ role: "user", content: c });
      turnIndex++;
      continue;
    }

    // assistant
    const text = m.content; // may be "" for a pure tool-call turn — valid with tool_calls
    const tools = Array.isArray(m.tools) ? m.tools : [];
    if (tools.length === 0) {
      if (text.trim() !== "") out.push({ role: "assistant", content: text });
      turnIndex++;
      continue;
    }

    // Pair each tool card with a stable id: prefer the provider's stored id; else
    // synthesize one unique within the conversation (turn + position).
    const ids = tools.map((t, i) =>
      typeof t.id === "string" && t.id !== "" ? t.id : `call_${turnIndex}_${i}`,
    );
    out.push({
      role: "assistant",
      content: text,
      tool_calls: tools.map((t, i) => ({
        id: ids[i],
        type: "function",
        function: {
          name: typeof t.name === "string" && t.name !== "" ? t.name : "tool",
          arguments: jsonString(t.input),
        },
      })),
    });
    tools.forEach((t, i) => {
      out.push({
        role: "tool",
        tool_call_id: ids[i],
        name: typeof t.name === "string" && t.name !== "" ? t.name : "tool",
        content: toolResultContent(t),
      });
    });
    turnIndex++;
  }

  const next = nextUserContent.trim();
  if (next !== "") out.push({ role: "user", content: next });
  return out;
}
