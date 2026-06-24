/**
 * Pure CLIENT-side parser for the CMS chat SSE protocol (Milestone 2, B-track UI).
 *
 * The chat route (`api/chat/route.ts`) emits our stable client protocol via
 * `frameEvent` (see `sse.ts`): each frame is
 *
 *   event: <name>\n
 *   data: <json>\n
 *   \n
 *
 * with `<name>` ∈ token | tool | done | error. The browser reads the response
 * body as a byte stream and decodes text chunks that can split mid-frame, so —
 * exactly like the server-side `SseDeltaParser` — we buffer the partial trailing
 * frame across chunks.
 *
 * This module is PURE (no DOM/React/fetch) so it's unit-testable with dep-free
 * `node --test` (project convention; see CAVEATS). The React component owns the
 * `fetch`/`ReadableStream`; here we own only the frame parsing.
 */

/** A parsed client-protocol event. Mirrors what the route's `frameEvent` emits. */
export type ChatEvent =
  | { type: "token"; text: string }
  | { type: "tool"; result: ToolResult }
  | { type: "done" }
  | { type: "error"; message: string };

/** A tool-execution result frame (`event: tool`). Shape from the route's `runTools`. */
export interface ToolResult {
  /** Tool name: create_component | create_page | translate. */
  name: string;
  ok: boolean;
  /** On success: "created" | "updated" (component/page) or translate's action. */
  action?: string;
  /** create_component success: the component name. */
  component?: string;
  /** create_page success: the page slug. */
  page?: string;
  /** translate success: the translated target. */
  target?: string;
  /** translate success: the count/list of translated fields. */
  fields?: unknown;
  /** list_assets success: the available assets ({url,filename,...}). */
  assets?: unknown[];
  /** On failure: validation / D1 error messages. */
  errors?: string[];
  /** Accordion (ai-widget-ux): the tool-call arguments the model sent. */
  input?: unknown;
  /** Accordion (ai-widget-ux): the full raw tool result the handler returned. */
  output?: unknown;
}

/**
 * Incremental parser for the client-protocol SSE stream.
 *
 * Feed decoded text chunks (any size, may split mid-frame); it buffers the
 * partial trailing frame and returns the complete events found so far. Frames
 * are separated by a blank line (`\n\n`). Call `flush()` at stream end to drain
 * a final frame that wasn't blank-line-terminated.
 */
export class ChatEventParser {
  private buffer = "";

  /** Feed one decoded chunk; returns any complete events it contained. */
  push(chunk: string): ChatEvent[] {
    this.buffer += chunk;
    const events: ChatEvent[] = [];
    // Frames are separated by a blank line. Keep the trailing partial frame.
    let sep: number;
    while ((sep = this.buffer.indexOf("\n\n")) !== -1) {
      const frame = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 2);
      const ev = parseFrame(frame);
      if (ev) events.push(ev);
    }
    return events;
  }

  /** Drain a final frame with no trailing blank line. Call once at stream end. */
  flush(): ChatEvent[] {
    const rest = this.buffer;
    this.buffer = "";
    const ev = parseFrame(rest);
    return ev ? [ev] : [];
  }
}

/**
 * Parse one SSE frame (the text between blank-line separators) into a ChatEvent,
 * or null if it carries nothing useful. Tolerant: unknown event names, missing
 * data, unparseable JSON → null rather than throwing (a malformed frame must not
 * kill the transcript).
 */
export function parseFrame(frame: string): ChatEvent | null {
  let event = "";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      // SSE allows the optional space after the colon.
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    // Other lines (comments, ids) are ignored.
  }
  if (event === "") return null;

  let data: Record<string, unknown> = {};
  const raw = dataLines.join("\n");
  if (raw !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
      return null; // tolerate garbage rather than throw
    }
  }

  switch (event) {
    case "token": {
      const text = data.text;
      return typeof text === "string" ? { type: "token", text } : null;
    }
    case "tool":
      return { type: "tool", result: toToolResult(data) };
    case "done":
      return { type: "done" };
    case "error": {
      const message = typeof data.message === "string" ? data.message : "unknown error";
      return { type: "error", message };
    }
    default:
      return null; // unknown event name
  }
}

/** Coerce a tool data frame into a typed ToolResult defensively. */
function toToolResult(data: Record<string, unknown>): ToolResult {
  const errors = Array.isArray(data.errors)
    ? data.errors.filter((e): e is string => typeof e === "string")
    : undefined;
  return {
    name: typeof data.name === "string" ? data.name : "tool",
    ok: data.ok === true,
    action: typeof data.action === "string" ? data.action : undefined,
    component: typeof data.component === "string" ? data.component : undefined,
    page: typeof data.page === "string" ? data.page : undefined,
    target: typeof data.target === "string" ? data.target : undefined,
    fields: data.fields,
    assets: Array.isArray(data.assets) ? data.assets : undefined,
    errors,
    input: data.input,
    // The whole frame IS the tool output (name/ok/action/... + per-tool payload).
    // Expose it for the accordion minus the input we threaded onto the frame.
    output: stripInput(data),
  };
}

/** A shallow copy of the tool frame without the threaded `input` key (that's the args, not the output). */
function stripInput(data: Record<string, unknown>): Record<string, unknown> {
  const { input: _input, ...rest } = data;
  void _input;
  return rest;
}
