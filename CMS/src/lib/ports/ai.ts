/**
 * `Ai` port — the ports-and-adapters seam for the AI model call (binding-adapters
 * subgoal). CMS code depends on this small interface instead of touching the
 * Cloudflare `env.AI` Workers AI binding directly.
 *
 * In scope: the interface + TWO adapters — `CfAi` (wraps `env.AI.run(...)` 1:1)
 * and `OpenRouterAi` (OpenAI-compatible HTTP call to openrouter.ai). The ORIGINAL
 * note said "no second adapter — CF-native"; the ai-openrouter goal INTENTIONALLY
 * reverses that: OpenRouter becomes the default provider, `CfAi` stays as the
 * fallback. The point of the port is exactly this swappability.
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

/** OpenRouter's OpenAI-compatible chat-completions endpoint. */
export const OPENROUTER_CHAT_URL =
  "https://openrouter.ai/api/v1/chat/completions";

/** Minimal `fetch` surface the OpenRouter adapter needs (so tests can fake it). */
type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{ ok: boolean; status: number; body: ReadableStream<Uint8Array> | null }>;

/**
 * OpenRouter adapter — same streaming OpenAI-compatible `Ai` contract as `CfAi`,
 * over HTTP. POSTs `{ messages, model, stream: true, tools? }` to OpenRouter with
 * `Authorization: Bearer <key>` and returns the raw upstream SSE byte stream
 * (`response.body`) UNCHANGED — no buffering, tool-calls round-trip as deltas.
 *
 * `gatewayId` is accepted for interface parity but unused here: OpenRouter has its
 * own gateway/spend controls; the CF AI Gateway slug doesn't apply.
 *
 * ponytail: injects `fetch` so the adapter is unit-testable against a fake; the
 * factory passes the global `fetch`.
 */
export class OpenRouterAi implements Ai {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  constructor(apiKey: string, fetchImpl: FetchLike = fetch as unknown as FetchLike) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): Promise<ReadableStream<Uint8Array>> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      stream: true,
    };
    if (options.tools) body.tools = options.tools;

    const res = await this.fetchImpl(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      throw new Error(
        `OpenRouter chat failed: HTTP ${res.status}${res.body ? "" : " (no body)"}`,
      );
    }
    return res.body;
  }
}

/**
 * The adapter factory + SOLE reader of `env.OPENROUTER_API_KEY` / `env.AI`.
 * Provider selection is ONE switch: prefer OpenRouter when its key is present
 * (the ai-openrouter default), else fall back to the CF Workers AI binding, else
 * `null` (neither provisioned) so the route answers 503 instead of 500 — matching
 * the previous in-route `if (!ai)` guard.
 *
 * ponytail: key-presence is the switch — no extra provider flag. Add an explicit
 * `AI_PROVIDER` var only if a Site ever needs CfAi despite having an OpenRouter key.
 */
export async function getAi(): Promise<Ai | null> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as { OPENROUTER_API_KEY?: string; AI?: AiBinding };
  const key = pickSelection(e);
  if (key.provider === "openrouter") return new OpenRouterAi(key.apiKey);
  if (key.provider === "cf") return new CfAi(e.AI as AiBinding);
  return null;
}

/**
 * Pure provider-selection rule, separated so it's unit-testable without the
 * Cloudflare context. OpenRouter wins when its key is a non-empty string; else
 * CF when the `AI` binding exists; else none.
 */
export function pickSelection(env: {
  OPENROUTER_API_KEY?: string;
  AI?: unknown;
}): { provider: "openrouter"; apiKey: string } | { provider: "cf" | "none" } {
  if (typeof env.OPENROUTER_API_KEY === "string" && env.OPENROUTER_API_KEY) {
    return { provider: "openrouter", apiKey: env.OPENROUTER_API_KEY };
  }
  if (env.AI) return { provider: "cf" };
  return { provider: "none" };
}

/**
 * Default AI Gateway slug — the gateway that actually exists on the account
 * (dashboard → AI → AI Gateway). MUST match a real gateway or `env.AI.run` fails
 * at runtime with `2001: Please configure AI Gateway`. Exported so a regression
 * test can pin it (the runtime call can't be exercised offline).
 *
 * ponytail: hardcoded default; per-Site override stays the `AI_GATEWAY` var.
 */
export const DEFAULT_AI_GATEWAY = "bizbeecms-ai-gateway";

/**
 * Resolve the AI Gateway slug for the current Site. Override at deploy time via
 * `AI_GATEWAY`; falls back to the default gateway so a freshly-provisioned Site
 * still works. Kept here so `env` reads stay in the port module.
 */
export async function getGatewayId(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  return (
    (env as unknown as { AI_GATEWAY?: string }).AI_GATEWAY ?? DEFAULT_AI_GATEWAY
  );
}
