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
 *   event: token   data: {"text": "<delta>"}     (0..N, the streamed tokens)
 *   event: done    data: {}                       (exactly once, at the end)
 *   event: error   data: {"message": "<reason>"}  (instead of done, on failure)
 *
 * This module is PURE (no CF/React/network imports) so it's unit-testable with
 * dep-free `node --test` (project convention; see CAVEATS). The route owns the
 * actual `ReadableStream`/`fetch`; here we own only the parsing + framing.
 */

/** A parsed upstream event: a text delta, the terminal marker, or nothing useful. */
export type UpstreamEvent =
  | { type: "delta"; text: string }
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
  const text = extractDelta(chunk);
  if (text === null || text === "") return null;
  return { type: "delta", text };
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
  event: "token" | "done" | "error",
  data: Record<string, unknown>,
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Validate + normalize the incoming chat request body. Pure so the route's
 * input contract is unit-testable. Returns the cleaned messages or an error
 * string (the route turns that into a 400).
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
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
    if (role !== "user" && role !== "assistant" && role !== "system") {
      return { error: `invalid message role: ${String(role)}` };
    }
    if (typeof content !== "string" || content.trim() === "") {
      return { error: "message content must be a non-empty string" };
    }
    cleaned.push({ role, content });
  }
  return { messages: cleaned };
}
