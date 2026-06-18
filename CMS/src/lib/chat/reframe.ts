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
