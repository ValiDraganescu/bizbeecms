/**
 * `Ai` port — the ports-and-adapters seam for the AI model call (binding-adapters
 * subgoal). CMS code depends on this small interface instead of touching the
 * Cloudflare `env.AI` Workers AI binding directly.
 *
 * In scope: the interface + a single Cloudflare adapter (`CfAi`) that wraps the
 * `env.AI.run(...)` call 1:1 — ZERO behavior change. NOT in scope: a second
 * (OpenAI/Anthropic-direct) adapter — main is "fully Cloudflare-native". We build
 * the socket, not the second plug.
 *
 * The port exposes ONLY what the chat route actually needs: one streaming chat
 * completion. It is the OpenAI-compatible Workers AI call — `messages` in, an SSE
 * `ReadableStream` out — through AI Gateway, with optional tool definitions. The
 * adapter preserves streaming (`stream: true`); it does NOT buffer the response.
 *
 * This module is the ONLY place that reads `env.AI`. The chat route takes an `Ai`
 * (via `getAi()`), which makes its stream-reframing logic unit-testable against a
 * fake binding (see `scripts/ai-port.test.mjs`).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** A chat message in the OpenAI-compatible shape Workers AI accepts. */
export interface ChatMessage {
  role: string;
  content: string;
}

/** Options for a streaming chat completion. `tools` is the OpenAI tool array. */
export interface ChatOptions {
  model: string;
  tools?: unknown[];
  /** AI Gateway slug — caching / per-Site spend caps / analytics / fallback. */
  gatewayId?: string;
}

/**
 * AI as the CMS uses it: a single OpenAI-compatible streaming chat completion.
 * Returns the raw upstream SSE byte stream (deltas + tool-call fragments), which
 * the caller re-frames — exactly the Workers AI `run(..., { stream: true })`
 * contract, so the adapter is a pass-through.
 */
export interface Ai {
  chat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): Promise<ReadableStream<Uint8Array>>;
}

/** The Cloudflare Workers AI binding surface this adapter wraps (its `run`). */
type AiBinding = {
  run(model: string, inputs: unknown, options?: unknown): Promise<unknown>;
};

/**
 * Cloudflare Workers AI adapter — wraps the `env.AI` binding as an `Ai`. The
 * `chat` call is the exact `ai.run(model, { messages, stream: true, tools }, {
 * gateway: { id } })` the chat route made before: streaming preserved, OpenAI
 * message + tool shape preserved, AI Gateway preserved. 1:1 pass-through.
 */
export class CfAi implements Ai {
  private readonly ai: AiBinding;
  constructor(ai: AiBinding) {
    this.ai = ai;
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): Promise<ReadableStream<Uint8Array>> {
    const inputs: Record<string, unknown> = { messages, stream: true };
    if (options.tools) inputs.tools = options.tools;
    const runOptions = options.gatewayId
      ? { gateway: { id: options.gatewayId } }
      : undefined;
    return (await this.ai.run(
      options.model,
      inputs,
      runOptions,
    )) as ReadableStream<Uint8Array>;
  }
}

/**
 * The adapter factory: resolve the live `Ai` from the Cloudflare context. The
 * single reader of `env.AI` in the app. Returns `null` when the binding is absent
 * (not yet provisioned for this Site) so the route can answer 503 instead of 500
 * — matching the previous in-route `if (!ai)` guard.
 */
export async function getAi(): Promise<Ai | null> {
  const { env } = await getCloudflareContext({ async: true });
  const ai = (env as unknown as { AI?: AiBinding }).AI;
  return ai ? new CfAi(ai) : null;
}

/**
 * Resolve the AI Gateway slug for the current Site. Override at deploy time via
 * `AI_GATEWAY`; falls back to the default gateway so a freshly-provisioned Site
 * still works. Kept here so `env` reads stay in the port module.
 */
export async function getGatewayId(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  return (env as unknown as { AI_GATEWAY?: string }).AI_GATEWAY ?? "bizbeecms-cms";
}
