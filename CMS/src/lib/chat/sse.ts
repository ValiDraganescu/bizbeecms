/**
 * Pure SSE plumbing for the CMS AI chat endpoint (Milestone 2, epic B1).
 *
 * The chat route calls Workers AI (`env.AI.run`, OpenAI-compatible, via AI
 * Gateway) with `stream: true`. Upstream emits an SSE byte stream of
 * `data: {<openai chunk>}` lines terminated by `data: [DONE]`. We re-frame
 * those into a small, stable client protocol so the browser never has to know
 * the upstream provider's wire format (swappable via the gateway — see B1 risk
 * note in BACKLOG):
 *
 *   event: token   data: {"text": "<delta>"}              (0..N, streamed tokens)
 *   event: tool    data: {"name", "ok", action|errors}    (0..N, B2 tool results)
 *   event: done    data: {}                                (exactly once, at the end)
 *   event: error   data: {"message": "<reason>"}           (instead of done, on failure)
 *
 * This module is PURE (no CF/React/network imports) so it's unit-testable with
 * dep-free `node --test` (project convention; see CAVEATS). The route owns the
 * actual `ReadableStream`/`fetch`; here we own only the parsing + framing.
 */

/** A parsed upstream event: a text delta, a tool-call fragment, or the terminal marker. */
export type UpstreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool_call"; index: number; id?: string; name?: string; argsFragment?: string }
  | { type: "done" };

/**
 * Incremental parser for an upstream OpenAI-style SSE stream.
 *
 * Feed it decoded text chunks (any size, may split mid-line); it buffers the
 * partial trailing line across calls and returns the complete events found so
 * far. Call `flush()` once the stream ends to drain any final buffered line.
 *
 * Kept as a tiny class because SSE framing is inherently stateful (a line can
 * straddle two network chunks). ponytail: minimal hand-rolled parser, no SSE
 * lib pulled in for ~30 lines.
 */
export class SseDeltaParser {
  private buffer = "";

  /** Feed one decoded text chunk; returns any complete events it contained. */
  push(chunk: string): UpstreamEvent[] {
    this.buffer += chunk;
    const events: UpstreamEvent[] = [];
    // Split on newlines; keep the last (possibly partial) line buffered.
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const ev = parseLine(line);
      if (ev) events.push(ev);
    }
    return events;
  }

  /** Drain the final buffered line (no trailing newline). Call once at stream end. */
  flush(): UpstreamEvent[] {
    const rest = this.buffer;
    this.buffer = "";
    const ev = parseLine(rest);
    return ev ? [ev] : [];
  }
}

/**
 * Parse a single SSE line into an UpstreamEvent, or null if it carries nothing
 * useful (blank line, comment, non-text chunk, unparseable JSON).
 *
 * Accepts both `data: ` and `data:` (spec allows the space to be optional).
 */
export function parseLine(line: string): UpstreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trimStart();
  if (payload === "") return null;
  if (payload === "[DONE]") return { type: "done" };

  let chunk: unknown;
  try {
    chunk = JSON.parse(payload);
  } catch {
    return null; // tolerate keep-alives / partial garbage rather than 500
  }
  // A streaming chunk carries EITHER a text delta OR a tool-call fragment (B2),
  // never both in the same delta. Check tool-calls first.
  const tool = extractToolCall(chunk);
  if (tool) return tool;
  const text = extractDelta(chunk);
  if (text === null || text === "") return null;
  return { type: "delta", text };
}

/**
 * Pull a tool-call fragment out of an OpenAI-style streaming chunk (B2).
 *
 * Tool calls stream as `choices[0].delta.tool_calls[]`, each entry keyed by
 * `index`; the `function.name` arrives once (in the opening fragment) and
 * `function.arguments` arrives as a string assembled across many chunks. We
 * surface ONE fragment per call (first tool_call in the delta — open models
 * emit one at a time); `ToolCallAccumulator` reassembles them by index.
 *
 * Returns null when the chunk has no tool-call delta.
 */
export function extractToolCall(chunk: unknown): UpstreamEvent | null {
  if (typeof chunk !== "object" || chunk === null) return null;
  const choices = (chunk as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const delta = (choices[0] as { delta?: unknown }).delta;
  if (typeof delta !== "object" || delta === null) return null;
  const calls = (delta as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(calls) || calls.length === 0) return null;
  const call = calls[0] as {
    index?: unknown;
    id?: unknown;
    function?: { name?: unknown; arguments?: unknown };
  };
  const index = typeof call.index === "number" ? call.index : 0;
  // The provider's own call id arrives once (opening fragment); we round-trip it so
  // a later tool_result references the SAME id (OpenAI/Claude both require the match).
  const id = typeof call.id === "string" && call.id !== "" ? call.id : undefined;
  const fn = call.function;
  const name =
    fn && typeof fn.name === "string" && fn.name !== "" ? fn.name : undefined;
  const argsFragment =
    fn && typeof fn.arguments === "string" ? fn.arguments : undefined;
  if (id === undefined && name === undefined && argsFragment === undefined) return null;
  return { type: "tool_call", index, id, name, argsFragment };
}

/**
 * Reassemble streamed `tool_call` fragments (by index) into complete calls.
 * The model emits a tool call's `arguments` as JSON-string fragments across
 * many SSE chunks; feed each `tool_call` event here, then `finish()` to get the
 * collected calls (name + concatenated raw argument string). PURE.
 */
export class ToolCallAccumulator {
  private calls = new Map<number, { id: string; name: string; args: string }>();

  /** Add one streamed tool-call fragment. */
  add(ev: { index: number; id?: string; name?: string; argsFragment?: string }): void {
    const cur = this.calls.get(ev.index) ?? { id: "", name: "", args: "" };
    if (ev.id) cur.id = ev.id;
    if (ev.name) cur.name = ev.name;
    if (ev.argsFragment) cur.args += ev.argsFragment;
    this.calls.set(ev.index, cur);
  }

  /** Any tool calls seen yet? */
  get size(): number {
    return this.calls.size;
  }

  /**
   * Return the assembled calls in index order, each with the provider's call `id`
   * (synthesized from the index when a provider omits it — Workers AI sometimes
   * does), and the raw concatenated `args` string parsed to JSON (or `null` if the
   * model emitted invalid JSON).
   */
  finish(): { id: string; name: string; args: unknown }[] {
    return [...this.calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, c]) => {
        let args: unknown = null;
        try {
          args = c.args === "" ? {} : JSON.parse(c.args);
        } catch {
          args = null;
        }
        return { id: c.id || `call_${index}`, name: c.name, args };
      });
  }
}

/**
 * Pull the assistant text delta out of an OpenAI-style streaming chunk.
 * Returns null when the chunk has no text (e.g. role-only opener, tool-call
 * deltas, usage-only final chunk).
 */
export function extractDelta(chunk: unknown): string | null {
  if (typeof chunk !== "object" || chunk === null) return null;
  const choices = (chunk as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const delta = (choices[0] as { delta?: unknown }).delta;
  if (typeof delta !== "object" || delta === null) return null;
  const content = (delta as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

/** Serialize one of our client-protocol events into an SSE frame string. */
export function frameEvent(
  event: "token" | "tool" | "done" | "error",
  data: Record<string, unknown>,
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Validate + normalize the incoming chat request body. Pure so the route's
 * input contract is unit-testable. Returns the cleaned messages or an error
 * string (the route turns that into a 400).
 */
/**
 * A tool call requested by the assistant (OpenAI/Claude structured-tool shape).
 * `id` pairs with the matching `role:"tool"` result's `tool_call_id`.
 */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * An OpenAI-compatible chat message content part (ai-attachments). A `user` turn
 * with attachments carries an ARRAY of these instead of a plain string: a text
 * part plus one inline (base64 data-URI) part per file. Mirrors `ContentPart` in
 * `./attachments.ts` — kept structural here so `sse.ts` stays dep-free.
 */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

/**
 * An OpenAI-compatible chat message. `user`/`system` carry plain text, OR a `user`
 * turn may carry a `ContentPart[]` (text + inline file parts — ai-attachments). An
 * `assistant` turn may instead (or also) carry `tool_calls` — then its `content`
 * may be empty. A `tool` message carries one tool result, keyed by `tool_call_id`.
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/** Validate one assistant `tool_calls` array; returns the cleaned calls or null if malformed. */
function parseToolCalls(raw: unknown): ToolCall[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ToolCall[] = [];
  for (const c of raw) {
    if (typeof c !== "object" || c === null) return null;
    const id = (c as { id?: unknown }).id;
    const fn = (c as { function?: unknown }).function;
    if (typeof id !== "string" || id === "") return null;
    if (typeof fn !== "object" || fn === null) return null;
    const name = (fn as { name?: unknown }).name;
    const args = (fn as { arguments?: unknown }).arguments;
    if (typeof name !== "string" || name === "") return null;
    // arguments is a JSON STRING in the OpenAI shape; tolerate a missing one as "{}".
    const argString = typeof args === "string" ? args : "{}";
    out.push({ id, type: "function", function: { name, arguments: argString } });
  }
  return out;
}

/**
 * Validate a `user` content ARRAY (ai-attachments): a text part + inline image/file
 * parts. Returns the cleaned parts, or null if malformed/empty. Each part must be a
 * known `type` with its required field a string; unknown/empty arrays → null so the
 * caller falls back to the string-content rule (and 400s an empty message).
 */
function parseContentParts(raw: unknown[]): ContentPart[] | null {
  const out: ContentPart[] = [];
  for (const p of raw) {
    if (typeof p !== "object" || p === null) return null;
    const type = (p as { type?: unknown }).type;
    if (type === "text") {
      const text = (p as { text?: unknown }).text;
      if (typeof text !== "string") return null;
      out.push({ type: "text", text });
    } else if (type === "image_url") {
      const url = (p as { image_url?: { url?: unknown } }).image_url?.url;
      if (typeof url !== "string" || url === "") return null;
      out.push({ type: "image_url", image_url: { url } });
    } else if (type === "file") {
      const file = (p as { file?: { filename?: unknown; file_data?: unknown } }).file;
      const filename = file?.filename;
      const fileData = file?.file_data;
      if (typeof filename !== "string" || typeof fileData !== "string" || fileData === "") {
        return null;
      }
      out.push({ type: "file", file: { filename, file_data: fileData } });
    } else {
      return null;
    }
  }
  return out.length > 0 ? out : null;
}

export function parseChatBody(
  body: unknown,
): { messages: ChatMessage[] } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "request body must be a JSON object" };
  }
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: "messages must be a non-empty array" };
  }
  const cleaned: ChatMessage[] = [];
  for (const m of messages) {
    if (typeof m !== "object" || m === null) {
      return { error: "each message must be an object" };
    }
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant" && role !== "system" && role !== "tool") {
      return { error: `invalid message role: ${String(role)}` };
    }

    // A `tool` result message: content is the JSON result, keyed by tool_call_id.
    if (role === "tool") {
      const id = (m as { tool_call_id?: unknown }).tool_call_id;
      if (typeof id !== "string" || id === "") {
        return { error: "tool message must have a tool_call_id" };
      }
      if (typeof content !== "string") {
        return { error: "tool message content must be a string" };
      }
      const name = (m as { name?: unknown }).name;
      cleaned.push({
        role: "tool",
        content,
        tool_call_id: id,
        ...(typeof name === "string" && name !== "" ? { name } : {}),
      });
      continue;
    }

    // An assistant turn may carry tool_calls; then empty content is valid (the
    // turn IS the tool request). This is the structured round-trip that lets
    // OpenAI- and Claude-family models continue a tool conversation.
    if (role === "assistant") {
      const toolCalls = parseToolCalls((m as { tool_calls?: unknown }).tool_calls);
      const text = typeof content === "string" ? content : "";
      if (!toolCalls && text.trim() === "") {
        return { error: "message content must be a non-empty string" };
      }
      cleaned.push({ role: "assistant", content: text, ...(toolCalls ? { tool_calls: toolCalls } : {}) });
      continue;
    }

    // user with attachments: a content ARRAY of text + inline file parts.
    if (role === "user" && Array.isArray(content)) {
      const parts = parseContentParts(content);
      if (!parts) {
        return { error: "message content array must be valid content parts" };
      }
      cleaned.push({ role, content: parts });
      continue;
    }

    // user / system: plain non-empty text.
    if (typeof content !== "string" || content.trim() === "") {
      return { error: "message content must be a non-empty string" };
    }
    cleaned.push({ role, content });
  }
  return { messages: cleaned };
}
