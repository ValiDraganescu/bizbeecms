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
import { getAi, getGatewayId } from "@/lib/ports/ai";
import { frameEvent, parseChatBody } from "@/lib/chat/sse";
import {
  streamChatRounds,
  type ChatMessage as TurnMessage,
  type ToolResult,
} from "@/lib/chat/reframe";
import {
  resolveRequestContext,
  type AdminPageContext,
} from "@/lib/chat/tool-scopes";
import { runTool, toolSchemasForContext } from "@/lib/chat/tool-dispatch";
import { assembleSystemPrompt } from "@/lib/chat/assemble-prompt";
import { resolveModel } from "@/lib/chat/models";
import { getModelCatalogCache } from "@/db/settings-store";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// DEFAULT_MODEL + the curated allowlist live in `lib/chat/models.ts` (pure, so
// the widget shares the same list). AI Gateway lets us point at a stronger model
// without re-architecting if tool-calling needs it.
//
// The tool registry + handlers now live in `lib/chat/tool-dispatch.ts` (shared
// with the cms-mcp MCP server). This route only owns the SSE framing around them.

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
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

  // Page-awareness (Slice 2): the client sends its current admin page as
  // `context` (one of the AdminPageContext values) or a `pathname` to derive it
  // from. Untrusted → validate / detect; unknown falls back to "general".
  const context = resolveContext(body);

  // Optional, UNTRUSTED `model` (the picker): validate against the cached
  // catalog ids (plus the static allowlist), fall back to DEFAULT_MODEL. Never
  // a 400 (same contract as `context`); arbitrary strings never reach
  // `env.AI.run`. The catalog cache is best-effort — a read failure just leaves
  // the static allowlist as the trust set.
  let catalogIds: ReadonlySet<string> | undefined;
  try {
    const cache = await getModelCatalogCache();
    if (cache) catalogIds = new Set(cache.models.map((m) => m.id));
  } catch {
    /* cache read failed — static allowlist still validates */
  }
  const model = resolveModel(
    typeof body === "object" && body !== null
      ? (body as { model?: unknown }).model
      : undefined,
    catalogIds,
  );

  const ai = await getAi();
  if (!ai) {
    // Binding missing (not yet provisioned for this Site). Don't 500 silently.
    return Response.json(
      { error: "AI binding not configured for this Site" },
      { status: 503 },
    );
  }

  // Prepend a system prompt built from the Site's identity (E2 brand/design/AI
  // persona) + its existing components + the bounded utility-class vocabulary, so
  // generated artifacts match the Site and reference real components/classes.
  // Only if the client didn't already supply a system message.
  const messages = await withSystemPrompt(parsed.messages, context);

  const tools = toolSchemasForContext(context);
  const gatewayId = await getGatewayId();
  // One model turn. Reused for the initial call AND each tool-result follow-up so
  // the loop re-asks with the SAME model/tool scope/gateway. Tools stay enabled on
  // every round so the model can chain (discover → act → act again).
  const turn = (msgs: TurnMessage[]) =>
    ai.chat(msgs as { role: string; content: string }[], { model, tools, gatewayId });

  let upstream: ReadableStream<Uint8Array>;
  try {
    upstream = await turn(messages);
  } catch (err) {
    return Response.json(
      { error: `AI request failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  // Multi-turn tool loop (round-tripping): a turn that calls tools gets its results
  // fed back so the model can chain. A turn with no tool call is the final answer.
  const stream = streamChatRounds(upstream, messages, turn, runToolsRound);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

type ChatMessage = { role: string; content: string };

/**
 * Resolve the admin page context from the raw request body. The client may send
 * an explicit `context` (validated against the known set) or a `pathname` we
 * detect from. Both untrusted → default to "general" (full toolset). Not part of
 * `parseChatBody` because it's optional and never a 400.
 */
function resolveContext(body: unknown): AdminPageContext {
  if (typeof body !== "object" || body === null) return "general";
  const b = body as { context?: unknown; pathname?: unknown };
  return resolveRequestContext(b.context, b.pathname);
}

/**
 * Build the E2 system prompt (Site identity + components + utility classes),
 * append the page-aware context prompt (Slice 2), and prepend it to the
 * conversation — unless the client already sent a system message (it owns the
 * prompt then). Reads are defensive: an unbound D1 (no Site provisioned, or this
 * offline env) falls back to an empty identity / no components, so the base
 * instruction still ships.
 */
async function withSystemPrompt(
  messages: ChatMessage[],
  context: AdminPageContext,
): Promise<ChatMessage[]> {
  if (messages.some((m) => m.role === "system")) return messages;
  const system = await assembleSystemPrompt(context);
  return [{ role: "system", content: system }, ...messages];
}


/**
 * Run one round's tool calls: frame a `tool` event per call (client SSE contract)
 * AND return the structured results so the loop can feed them back to the model
 * (round-tripping). The actual tool logic lives in the shared `runTool` dispatch
 * (`lib/chat/tool-dispatch.ts`) — same validated handlers the MCP server uses.
 * `runTool` never throws (unknown tool / handler error → `{ok:false, errors}`),
 * so one bad tool call can't kill the stream.
 */
async function runToolsRound(
  calls: { name: string; args: unknown }[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of calls) {
    const data = await runTool(call.name, call.args);
    controller.enqueue(encoder.encode(frameEvent("tool", data)));
    results.push({ name: data.name, data });
  }
  return results;
}
