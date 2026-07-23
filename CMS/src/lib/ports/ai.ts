/**
 * `Ai` port — the ports-and-adapters seam for the AI model call (binding-adapters
 * subgoal). CMS code depends on this small interface instead of talking to the
 * provider directly.
 *
 * ONE adapter: `OpenRouterAi` (OpenAI-compatible HTTP call to openrouter.ai).
 * OpenRouter is the ONLY provider — the old `CfAi` Workers-AI fallback (and its
 * AI Gateway plumbing) was removed once every Site shipped with an OpenRouter
 * key; no key now means the AI routes answer 503.
 *
 * The port exposes ONLY what the chat route actually needs: one streaming chat
 * completion — `messages` in, an SSE `ReadableStream` out — with optional tool
 * definitions. The adapter preserves streaming (`stream: true`); it does NOT
 * buffer the response.
 *
 * The chat route takes an `Ai` (via `getAi()`), which makes its stream-reframing
 * logic unit-testable against a fake (see `scripts/openrouter-ai.test.mjs`).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDecryptedOpenrouterUserKey } from "../../db/openrouter-key-store.ts";
import { effectiveOpenrouterKey } from "../settings/openrouter-key.ts";

/**
 * A chat message in the OpenAI-compatible shape Workers AI / OpenRouter accept.
 * `user`/`system` carry plain text; an `assistant` turn may carry `tool_calls`
 * (then `content` may be ""); a `tool` message carries one result keyed by
 * `tool_call_id`. The adapters forward these fields verbatim so the structured
 * tool protocol round-trips to OpenAI- and Claude-family models alike.
 */
export interface ChatMessage {
  role: string;
  /**
   * Plain text, OR an OpenAI/OpenRouter content-part array (ai-attachments) for a
   * `user` turn carrying inline file attachments. The adapters forward it verbatim
   * (JSON), so both the string and array shapes round-trip to the model.
   */
  content: string | unknown[];
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
  name?: string;
}

/** Options for a streaming chat completion. `tools` is the OpenAI tool array. */
export interface ChatOptions {
  model: string;
  tools?: unknown[];
  /** Hard cap on tokens GENERATED per turn. Bounds cost + runaway output. */
  maxTokens?: number;
}

/**
 * Default cap on generated tokens per turn. Generous enough for a full component
 * artifact (tree+script+css can be a few KB ≈ a couple thousand tokens) with head-
 * room, but bounded so a runaway turn can't bill unbounded output. Override per
 * call via ChatOptions.maxTokens. ponytail: one constant, not a per-Site setting.
 */
export const DEFAULT_MAX_TOKENS = 8000;

/**
 * AI as the CMS uses it: a single OpenAI-compatible streaming chat completion.
 * Returns the raw upstream SSE byte stream (deltas + tool-call fragments), which
 * the caller re-frames — the adapter is a pass-through.
 */
export interface Ai {
  chat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): Promise<ReadableStream<Uint8Array>>;
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
) => Promise<{
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}>;

/**
 * OpenRouter adapter — the streaming OpenAI-compatible `Ai` contract over HTTP.
 * POSTs `{ messages, model, stream: true, tools? }` to OpenRouter with
 * `Authorization: Bearer <key>` and returns the raw upstream SSE byte stream
 * (`response.body`) UNCHANGED — no buffering, tool-calls round-trip as deltas.
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
      // Ask OpenRouter to emit a final usage chunk (prompt/completion/total
      // tokens) so the route can surface context usage to the widget.
      stream_options: { include_usage: true },
      // Ask OpenRouter to include the ACTUAL charged cost (`usage.cost`, USD) in
      // that final chunk — the metering source of truth (docs/ai-cost-quotas.md).
      // Belt-and-braces: OpenRouter includes it by default now.
      usage: { include: true },
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
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
      // Surface OpenRouter's error body (credits/402, bad-key/401, model errors)
      // instead of swallowing it — "HTTP 402" alone tells you nothing. Bounded so
      // a huge body can't blow up the log line.
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 500);
      } catch {
        /* body unavailable */
      }
      throw new Error(
        `OpenRouter chat failed: HTTP ${res.status}${detail ? ` — ${detail}` : res.body ? "" : " (no body)"}`,
      );
    }
    return res.body;
  }
}

/**
 * The adapter factory + SOLE reader of `env.OPENROUTER_API_KEY`. OpenRouter is
 * the only provider: a usable key yields an `OpenRouterAi`, no key yields `null`
 * so the routes answer 503 instead of 500.
 *
 * CMS-local user key override (ai-openrouter): the CMS-local user key (encrypted
 * in this Site's D1, KEK = `CMS_AUTH_SECRET`) is read and PREFERRED over the
 * deployer-injected `OPENROUTER_API_KEY`. So precedence is CMS-local user key →
 * env OPENROUTER_API_KEY (minted/global) → null/503. A missing/failed decrypt
 * falls through to the env key — NEVER throws here.
 */
export async function getAi(): Promise<Ai | null> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as {
    OPENROUTER_API_KEY?: string;
    CMS_AUTH_SECRET?: string;
  };

  // CMS-local user key wins over the deployer-injected env key.
  let userKey: string | null = null;
  if (typeof e.CMS_AUTH_SECRET === "string" && e.CMS_AUTH_SECRET) {
    try {
      userKey = await getDecryptedOpenrouterUserKey(e.CMS_AUTH_SECRET);
    } catch {
      userKey = null; // never let a settings read break the chat route
    }
  }
  const orKey = effectiveOpenrouterKey(userKey, e.OPENROUTER_API_KEY);
  return orKey ? new OpenRouterAi(orKey) : null;
}
