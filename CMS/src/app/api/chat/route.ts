/**
 * CMS AI-assistant chat endpoint (Milestone 2, epic B1) — streaming, no tools yet.
 *
 * POST a `{ messages: [{role, content}, ...] }` body; get back a `text/event-stream`
 * of our re-framed protocol (see `lib/chat/sse.ts`): `token` events as the model
 * streams, then a single `done` (or `error`).
 *
 * Provider = Cloudflare **Workers AI** (`env.AI`, no API key, billed via CF)
 * behind **AI Gateway** (caching / per-Site spend caps / analytics / provider
 * fallback). We call the OpenAI-compatible `env.AI.run(model, {messages, stream})`,
 * which returns an SSE `ReadableStream`; we parse + re-frame it.
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers; see project memory). This is a plain route handler taking a
 * `Request` and returning a streaming `Response`.
 *
 * The SSE parsing/framing + body validation are pure and unit-tested
 * (`scripts/chat-sse.test.mjs`); the live model call needs a real `AI` binding +
 * gateway (HITL — can't be exercised offline).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SseDeltaParser, frameEvent, parseChatBody } from "@/lib/chat/sse";

export const dynamic = "force-dynamic";

// Default Workers AI model. Swappable per the B1 risk note: AI Gateway lets us
// point at a stronger model without re-architecting if tool-calling needs it.
const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// AI Gateway slug. Override at deploy time via the AI_GATEWAY env var; falls
// back to the default gateway name so a freshly-provisioned Site still works.
function gatewayId(env: CloudflareEnv): string {
  return (env as unknown as { AI_GATEWAY?: string }).AI_GATEWAY ?? "bizbeecms-cms";
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = parseChatBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const ai = (env as unknown as { AI?: Ai }).AI;
  if (!ai) {
    // Binding missing (not yet provisioned for this Site). Don't 500 silently.
    return Response.json(
      { error: "AI binding not configured for this Site" },
      { status: 503 },
    );
  }

  let upstream: ReadableStream<Uint8Array>;
  try {
    // OpenAI-compatible streaming call through AI Gateway.
    upstream = (await ai.run(
      DEFAULT_MODEL as Parameters<Ai["run"]>[0],
      { messages: parsed.messages, stream: true } as Parameters<Ai["run"]>[1],
      { gateway: { id: gatewayId(env) } } as Parameters<Ai["run"]>[2],
    )) as unknown as ReadableStream<Uint8Array>;
  } catch (err) {
    return Response.json(
      { error: `AI request failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const stream = reframe(upstream);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * Pipe the upstream OpenAI-style SSE stream through the pure parser and emit our
 * client protocol. Keeps the network/stream wiring thin; all decisions live in
 * the unit-tested `SseDeltaParser`.
 */
function reframe(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const parser = new SseDeltaParser();
  const reader = upstream.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        const events = done
          ? parser.flush()
          : parser.push(decoder.decode(value, { stream: true }));
        let sawDone = false;
        for (const ev of events) {
          if (ev.type === "delta") {
            controller.enqueue(encoder.encode(frameEvent("token", { text: ev.text })));
          } else {
            sawDone = true;
          }
        }
        if (done || sawDone) {
          controller.enqueue(encoder.encode(frameEvent("done", {})));
          controller.close();
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
