/**
 * The streaming consume/forward stage of the CMS AI chat endpoint (Milestone 2,
 * epics B1/B2). Lives apart from `route.ts` so it's node-loadable and unit-testable
 * against a FAKE `Ai` port (binding-adapters subgoal) — proving the Ai seam's
 * streaming contract end-to-end, not just the adapter's pass-through.
 *
 * `reframe` reads the upstream OpenAI-style SSE byte stream (exactly what
 * `Ai.chat(..)` returns — a `ReadableStream<Uint8Array>`), feeds it through the
 * pure `SseDeltaParser`, and emits our small client protocol (see `sse.ts`):
 * `token` events as text deltas arrive, then any `tool` events from the
 * accumulated tool calls, then a single `done` (or `error`). It NEVER buffers the
 * whole response — it pulls chunk-by-chunk and forwards incrementally.
 *
 * Tool dispatch (CF-coupled: D1/R2 writes) is INJECTED as `runTools` so this
 * module stays pure (no `@/` / CF / store imports). The route passes its real
 * `runTools`; tests pass a fake. ponytail: one injected callback, no tool registry
 * abstraction — there's exactly one caller.
 *
 * Round-tripping (`streamChatRounds`): a single `reframe` pass is one model turn —
 * it runs tools but never feeds the results back, so the model can't chain
 * (discover → then act). `streamChatRounds` drives the multi-turn loop: stream a
 * turn, run its tools, and if any ran, append the assistant's tool_calls + each
 * tool result to the transcript and ask the model again — up to `maxRounds`. A
 * turn with no tool call is the final answer (token… done). Single-pass `reframe`
 * stays for back-compat + tests.
 */
import {
  SseDeltaParser,
  ToolCallAccumulator,
  frameEvent,
} from "./sse.ts";

/** Runs the accumulated tool calls, emitting one `tool` frame per call. */
export type RunTools = (
  tools: ToolCallAccumulator,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
) => Promise<void>;

/**
 * Pipe the upstream OpenAI-style SSE stream through the pure parser and emit our
 * client protocol. As the model streams, text deltas frame as `token`. Tool-call
 * fragments accumulate; when the stream ends we run them (via the injected
 * `runTools`) and frame a `tool` result per call, then a single `done`. A stream
 * with no tool call behaves exactly like B1 (token… done). Any error is framed as
 * a single `error` event — one failure never throws past the stream.
 */
export function reframe(
  upstream: ReadableStream<Uint8Array>,
  runTools: RunTools,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const parser = new SseDeltaParser();
  const tools = new ToolCallAccumulator();
  const reader = upstream.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // Pull upstream chunks until we have at least one frame to emit (or the
        // stream ends). An upstream chunk can carry a partial line / only
        // tool-call fragments, yielding zero client frames; a single read per
        // pull() would then leave the consumer's read() pending forever, so we
        // loop here until there's output or we close.
        for (;;) {
          const { done, value } = await reader.read();
          const events = done
            ? parser.flush()
            : parser.push(decoder.decode(value, { stream: true }));
          let sawDone = false;
          let emitted = false;
          for (const ev of events) {
            if (ev.type === "delta") {
              controller.enqueue(encoder.encode(frameEvent("token", { text: ev.text })));
              emitted = true;
            } else if (ev.type === "tool_call") {
              tools.add(ev);
            } else {
              sawDone = true;
            }
          }
          if (done || sawDone) {
            // Execute any tool calls the model made before closing.
            if (tools.size > 0) {
              await runTools(tools, controller, encoder);
            }
            controller.enqueue(encoder.encode(frameEvent("done", {})));
            controller.close();
            return;
          }
          if (emitted) return;
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(frameEvent("error", { message: (err as Error).message })),
        );
        controller.close();
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {});
    },
  });
}

// ── Round-tripping (tool result → model) ─────────────────────────────────────

/** An OpenAI-compatible message — what the model both reads and (for tools) we synthesize. */
export interface ChatMessage {
  role: string;
  content: string;
  /** Present only on the assistant turn that requested tools (we synthesize it). */
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  /** Present only on a `role:"tool"` result message. */
  tool_call_id?: string;
  name?: string;
}

/** One executed tool's result, used both to frame a `tool` event AND to feed the model. */
export interface ToolResult {
  /** The tool's function name. */
  name: string;
  /** The full result object emitted to the client (also serialized back to the model). */
  data: Record<string, unknown>;
}

/**
 * Run the accumulated tool calls for ONE round: emit a `tool` frame per call (the
 * existing client contract) AND return the structured results so the loop can feed
 * them back to the model. Injected by the route (CF-coupled); tests pass a fake.
 *
 * `calls` is the assembled calls (name + parsed args), in order — the same
 * `ToolCallAccumulator.finish()` output, but the loop owns iteration so it can pair
 * each result with the synthesized assistant `tool_calls` entry by index.
 */
export type RunToolsRound = (
  calls: { id: string; name: string; args: unknown }[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
) => Promise<ToolResult[]>;

/** Asks the model for the next turn given the running transcript. */
export type NextTurn = (messages: ChatMessage[]) => Promise<ReadableStream<Uint8Array>>;

/**
 * Consume ONE upstream model turn: forward text deltas as `token` frames and
 * collect the turn's text + tool calls. Does NOT emit `done` — the loop decides
 * whether to continue. Returns the accumulated assistant text and assembled tool
 * calls. Throws on upstream read error (the loop frames the `error`).
 *
 * Reused by `streamChatRounds`; shares the cross-chunk buffering logic with
 * `reframe`'s single pass.
 */
async function consumeTurn(
  upstream: ReadableStream<Uint8Array>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<{ text: string; calls: { id: string; name: string; args: unknown }[] }> {
  const decoder = new TextDecoder();
  const parser = new SseDeltaParser();
  const tools = new ToolCallAccumulator();
  const reader = upstream.getReader();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const events = done
        ? parser.flush()
        : parser.push(decoder.decode(value, { stream: true }));
      let sawDone = false;
      for (const ev of events) {
        if (ev.type === "delta") {
          text += ev.text;
          controller.enqueue(encoder.encode(frameEvent("token", { text: ev.text })));
        } else if (ev.type === "tool_call") {
          tools.add(ev);
        } else {
          sawDone = true;
        }
      }
      if (done || sawDone) {
        return { text, calls: tools.size > 0 ? tools.finish() : [] };
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** Synthesize the assistant turn that requested these tool calls (OpenAI shape). */
function assistantToolCallMessage(
  text: string,
  calls: { id: string; name: string; args: unknown }[],
): ChatMessage {
  return {
    role: "assistant",
    content: text,
    tool_calls: calls.map((c) => ({
      id: c.id,
      type: "function",
      function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
    })),
  };
}

/**
 * Drive the multi-turn tool loop. Stream a turn; if it called tools, run them
 * (framing `tool` events), append the assistant's tool_calls + each tool result as
 * a `role:"tool"` message, and ask the model again — until a turn calls no tools
 * (final answer) or `maxRounds` is hit. Emits exactly one `done` (or `error`).
 *
 * ponytail: results are serialized to JSON for the `tool` message content — the
 * model only needs the data we already emit to the client; no separate "model view".
 * maxRounds caps a runaway create→create loop; the last round's tools still run but
 * we don't ask for a follow-up.
 */
export function streamChatRounds(
  initial: ReadableStream<Uint8Array>,
  messages: ChatMessage[],
  nextTurn: NextTurn,
  runTools: RunToolsRound,
  maxRounds = 4,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const transcript = [...messages];
  let upstream: ReadableStream<Uint8Array> | null = initial;
  let started = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      if (started) return;
      started = true;
      try {
        for (let round = 0; round < maxRounds; round++) {
          const turn = upstream;
          upstream = null;
          if (!turn) break;
          const { text, calls } = await consumeTurn(turn, controller, encoder);

          if (calls.length === 0) break; // final answer — no tools requested

          const results = await runTools(calls, controller, encoder);

          if (round === maxRounds - 1) break; // cap: ran the tools, but no follow-up turn

          // Feed the round back: the assistant's tool_calls, then each result,
          // each keyed by the SAME provider call id (OpenAI/Claude require the
          // tool_call_id ↔ tool_calls[].id match).
          transcript.push(assistantToolCallMessage(text, calls));
          results.forEach((r, i) => {
            transcript.push({
              role: "tool",
              tool_call_id: calls[i].id,
              name: r.name,
              content: JSON.stringify(r.data),
            });
          });
          upstream = await nextTurn(transcript);
        }
        controller.enqueue(encoder.encode(frameEvent("done", {})));
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(frameEvent("error", { message: (err as Error).message })),
        );
        controller.close();
      }
    },
  });
}
