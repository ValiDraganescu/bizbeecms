/**
 * PUBLIC guest-chat streaming endpoint (public guest-facing chatbots epic).
 *
 * A logged-out visitor's chat widget POSTs `{ pageId, blockId, messages }`; we
 * run the conversation server-side against the agent an operator PUBLISHED on
 * that page and stream back the site SSE protocol (token/tool/usage/done/error).
 *
 * SECURITY MODEL (mirrors `/api/forms/submit`): the browser sends only the page +
 * block identity + transcript. The target is re-read from the PUBLISHED page's
 * blocks server-side (`findGuestChatBlock`), so a visitor can NEVER choose the
 * model, prompt, or tools — only talk to an agent an operator published. The
 * client transcript is sanitized (system roles stripped); tool SSE frames carry
 * ONLY `{name, ok, id}` — never args or results. When the conversation has a
 * STORED transcript, the model context is rehydrated from it (full tool
 * fidelity, agent-scoped read) and the client transcript only contributes the
 * new user turn — see `rehydrateGuestTranscript` for the desync fallback.
 *
 * LAYERED abuse limits (message-count based; tokens recorded, not enforced):
 *  - per-IP minute sliding window (login_attempt table, kind "chat" — that
 *    table prunes to the 15-min throttle window, so it can only carry the
 *    MINUTE limit),
 *  - per-IP/day + per-site/day message budgets (usage_counter day buckets),
 *  - per-conversation transcript + tool-round caps, per-response token cap.
 *
 * NO `requireAdmin` — this is the one public AI surface. force-dynamic, REST only.
 * Failures are DELIBERATE JSON responses (never a 500 leaking internals); only
 * the model stream itself uses SSE (a mid-stream failure frames a single `error`).
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { page as pageTable } from "@/db/schema";
import { getVersion } from "@/db/page-version-store";
import { pickRenderBlocks } from "@/lib/pages/page-version";
import { parseJsonColumn, type Block } from "@/lib/render/tree";
import { getChatAgent } from "@/db/chat-agent-store";
import { getCounter, incrementCounter } from "@/db/usage-counter-store";
import { meterAiCall } from "@/db/ai-usage-store";
import { getAiConfig, resolveModelForPurpose } from "@/lib/ai-config";
import {
  recentFailureTimestamps,
  recordFailure,
} from "@/db/login-attempt-store";
import { getDataSource, listDataSourceRequests } from "@/db/data-source-store";
import { getCollection } from "@/db/collection-store";
import { requestPlaceholders } from "@/lib/data-sources/validate";
import { getAi, type ChatMessage as AiChatMessage } from "@/lib/ports/ai";
import {
  streamChatRounds,
  type ChatMessage as TurnMessage,
  type ToolResult,
} from "@/lib/chat/reframe";
import { frameEvent } from "@/lib/chat/sse";
import { resolveModel, outputCapFor } from "@/lib/chat/models";
import { getModelCatalogCache } from "@/db/settings-store";
import {
  parseAgentConfig,
  sanitizeGuestMessages,
  decideChatRate,
  parseConversationMeta,
  rehydrateGuestTranscript,
  stampForModel,
  timeContextLine,
  capConversationPayload,
  usageCostNanoUsd,
  type ChatAgentConfig,
  type ConversationPayload,
} from "@/lib/public-chat/core";
import { getConversation, upsertConversation } from "@/db/chat-conversation-store";
import { buildGuestTools, assembleGuestPrompt } from "@/lib/public-chat/guest-tools";
import { findGuestChatBlock } from "@/lib/public-chat/find-block";
import {
  runGuestTool,
  guestKek,
  type GuestToolContext,
} from "@/lib/public-chat/dispatch";

export const dynamic = "force-dynamic";

/** Reject bodies larger than this before parsing (transcript is the bulk). */
const MAX_BODY_BYTES = 256 * 1024;

/** Best-effort client IP for the rate-limit key (Workers sets cf-connecting-ip). */
function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

export async function POST(request: Request): Promise<Response> {
  try {
    // ── Trust boundary: size cap, then JSON parse ──────────────────────────
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return Response.json({ error: "message too large" }, { status: 413 });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const b = body && typeof body === "object" && !Array.isArray(body)
      ? (body as { pageId?: unknown; blockId?: unknown; messages?: unknown })
      : {};
    const pageId = typeof b.pageId === "string" ? b.pageId : "";
    const blockId = typeof b.blockId === "string" ? b.blockId : "";
    if (!pageId || !blockId) {
      return Response.json({ error: "chat not available" }, { status: 404 });
    }
    // Conversation meta (pure validation): an invalid conversationId → "" makes
    // the request anonymous — still answered, just never persisted.
    const meta = parseConversationMeta(body);

    // ── Resolve the agent from the PUBLISHED page (never from the client) ───
    const agentRow = await resolveAgent(pageId, blockId);
    if (!agentRow) {
      return Response.json({ error: "chat not available" }, { status: 404 });
    }
    const config = parseAgentConfig(agentRow.limits, agentRow.dataSources, agentRow.collections);

    // ── Per-IP MINUTE rate limit (needs the agent's limits, so resolved
    // first). Record first (like the form route) then decide on the pre-record
    // stamps. login_attempt prunes to the 15-min throttle window, so only the
    // minute window of decideChatRate can ever fire here — the DAY limit is
    // enforced below via a usage_counter day bucket instead.
    const ip = clientIp(request);
    const rateKey = `chat:${ip}`;
    const stamps = await recentFailureTimestamps(rateKey, Date.now(), "chat");
    await recordFailure(rateKey, Date.now(), "chat");
    if (decideChatRate(stamps, config.limits).locked) {
      return Response.json(
        { error: "too many messages — please slow down and try again shortly" },
        { status: 429 },
      );
    }

    // ── Sanitize the transcript BEFORE burning any day budget (a malformed
    // or over-long request must not consume the site's quota) ──────────────
    const sanitized = sanitizeGuestMessages(b.messages, config.limits);
    if (!sanitized.ok) {
      return Response.json({ error: sanitized.error }, { status: sanitized.status });
    }

    // ── Per-IP/day + per-site/day message budgets (usage_counter buckets) ──
    const day = new Date().toISOString().slice(0, 10);
    const ipDayKey = `chat:ip:${ip}:${day}`;
    if ((await getCounter(ipDayKey)) >= config.limits.perIpPerDay) {
      return Response.json(
        { error: "daily message limit reached — please try again tomorrow" },
        { status: 429 },
      );
    }
    const messagesKey = `chat:${agentRow.id}:${day}:messages`;
    if ((await getCounter(messagesKey)) >= config.limits.siteMessagesPerDay) {
      return Response.json(
        { error: "the assistant is unavailable right now — please try again later" },
        { status: 429 },
      );
    }
    await Promise.all([incrementCounter(ipDayKey), incrementCounter(messagesKey)]);

    // ── Build the guest tools + system prompt from the allowlist ───────────
    const { tools, collectionFields } = await buildTools(config);
    // System prompt = the operator prompt + tool listing + guardrails, then a
    // time-context line giving the model the visitor's zone. Everything here is
    // STABLE across a conversation's requests (provider prompt-cache prefix) —
    // "now" travels in each user turn's [at …] stamp, never in the system prompt.
    const systemPrompt =
      assembleGuestPrompt(
        { name: agentRow.name, systemPrompt: agentRow.systemPrompt },
        tools,
      ) +
      "\n\n" +
      timeContextLine(meta.timezone, meta.utcOffsetMinutes);
    // ── Model context: rehydrate the STORED transcript when we have one ────
    // The stored conversation carries full gateway fidelity (tool_calls + tool
    // results), so the model keeps what its tools already learned across turns
    // instead of re-fetching it. Any miss — anonymous request, no stored row,
    // a store/client desync — falls back to the client's text transcript
    // (the pre-rehydration behavior). Read failures are treated as a miss.
    let rehydrated: TurnMessage[] | null = null;
    if (meta.conversationId !== "") {
      const prior = await getConversation(agentRow.id, meta.conversationId).catch(() => null);
      if (prior) {
        rehydrated = rehydrateGuestTranscript(
          prior.payload,
          sanitized.messages,
        ) as TurnMessage[] | null;
      }
    }
    // The model sees each turn's local timestamp suffixed onto its content — this
    // stamped transcript IS the gateway payload.
    const modelMessages =
      rehydrated ?? stampForModel(sanitized.messages, meta.utcOffsetMinutes);
    const messages: TurnMessage[] = [
      { role: "system", content: systemPrompt },
      ...modelMessages,
    ];

    // ── Model + AI port ────────────────────────────────────────────────────
    const ai = await getAi();
    if (!ai) {
      return Response.json({ error: "chat not available" }, { status: 503 });
    }
    const catalog = await catalogModels();
    // The agent's stored model is a curated alias key (new) or a legacy raw
    // model id. A curated match wins; with no curated config we keep the legacy
    // catalog-validated behavior (unknown → DEFAULT_MODEL).
    const curated = resolveModelForPurpose(
      await getAiConfig(),
      "chatAgent",
      agentRow.model ?? undefined,
    );
    const model =
      curated?.model ??
      resolveModel(
        agentRow.model ?? undefined,
        catalog ? new Set(catalog.map((m) => m.id)) : undefined,
      );
    // Model-based output cap: the operator's configured number is a cost knob,
    // but the SELECTED model's own output cap (a fraction of its context
    // window, same rule as the admin chat route) always bounds it. The entry
    // also carries the per-token prices the usage callback bills against.
    const catalogEntry = catalog?.find((m) => m.id === model);
    const contextLength = catalogEntry?.contextLength ?? null;
    const modelCap = outputCapFor(contextLength);
    const maxTokens = modelCap
      ? Math.min(config.limits.maxTokensPerResponse, modelCap)
      : config.limits.maxTokensPerResponse;
    const toolSchemas = tools.map((t) => t.schema);

    const turn = (msgs: TurnMessage[]) =>
      ai.chat(msgs as AiChatMessage[], { model, tools: toolSchemas, maxTokens });

    let upstream: ReadableStream<Uint8Array>;
    try {
      upstream = await turn(messages);
    } catch {
      return Response.json({ error: "chat failed" }, { status: 502 });
    }

    // ── Guest tool dispatch + token recording ──────────────────────────────
    const toolCtx: GuestToolContext = {
      config,
      tools,
      collectionFields,
      callCounts: new Map(),
      kek: await guestKek(),
      offsetMinutes: meta.utcOffsetMinutes,
    };
    const tokensKey = `chat:${agentRow.id}:${day}:tokens`;
    const costKey = `chat:${agentRow.id}:${day}:cost`;
    // Tokens and cost are RECORDED for visibility, not enforced. Fire-and-forget
    // in the usage callback (`.catch` swallow) rather than `waitUntil`: the
    // callback fires mid-stream, before the response settles, so a per-turn
    // increment is simplest and can't be dropped by an early stream close. Each
    // usage event is one upstream call (full-context prompt + that turn's
    // completion), so pricing events independently and summing is exact. The
    // LAST event's counts are also kept for the persisted conversation row.
    let lastUsage: { promptTokens: number; completionTokens: number } = {
      promptTokens: 0,
      completionTokens: 0,
    };
    const onUsage = (u: {
      totalTokens?: number;
      promptTokens?: number;
      completionTokens?: number;
      cost?: number;
    }) => {
      if (u.totalTokens && u.totalTokens > 0) {
        incrementCounter(tokensKey, u.totalTokens).catch(() => {});
      }
      if (u.cost !== undefined) {
        // The provider told us what it actually charged: meter the month's
        // raw+billable spend and bill this agent's daily counter the SAME
        // billable amount, so analytics and the quota meter agree.
        meterAiCall("chatAgent", model, u.cost)
          .then((billableNano) => {
            if (billableNano > 0) return incrementCounter(costKey, billableNano);
          })
          .catch(() => {});
      } else {
        // No cost upstream → fall back to the legacy token × catalog-price
        // estimate for the agent counter (monthly spend records nothing rather
        // than guessing).
        const costNano = usageCostNanoUsd(u, catalogEntry);
        if (costNano > 0) {
          incrementCounter(costKey, costNano).catch(() => {});
        }
      }
      lastUsage = {
        promptTokens: u.promptTokens ?? lastUsage.promptTokens,
        completionTokens: u.completionTokens ?? lastUsage.completionTokens,
      };
    };

    // Persist the full gateway-fidelity conversation after the model finishes.
    // Skipped entirely when the conversationId is invalid (anonymous request).
    // Fire-and-forget: a persistence failure must never break the visitor's stream.
    const onComplete =
      meta.conversationId === ""
        ? undefined
        : (transcript: TurnMessage[]) => {
            const payload = buildConversationPayload(
              transcript,
              systemPrompt,
              toolSchemas,
              model,
              meta,
              lastUsage,
            );
            upsertConversation({
              id: meta.conversationId,
              agentId: agentRow.id,
              pageId,
              blockId,
              timezone: meta.timezone || null,
              utcOffsetMinutes: meta.utcOffsetMinutes,
              model,
              messageCount: payload.messages.length,
              promptTokens: lastUsage.promptTokens,
              completionTokens: lastUsage.completionTokens,
              payload: JSON.stringify(payload),
            }).catch(() => {});
          };

    const stream = streamChatRounds(
      upstream,
      messages,
      turn,
      guestRunToolsRound(toolCtx),
      config.limits.maxToolRounds,
      onUsage,
      onComplete,
    );
    return new Response(stream, { headers: SSE_HEADERS });
  } catch {
    return Response.json({ error: "chat failed" }, { status: 500 });
  }
}

/**
 * Assemble the persisted conversation payload from the reframe transcript.
 *
 * Drops the leading system turn (kept separately in `payload.system`). Each
 * remaining entry is verbatim as sent/received (incl. `tool_calls` / `role:"tool"`
 * entries); the client `at` on user/assistant turns is preserved, and a server
 * UTC `at` is stamped on entries the model/tools produced (which carry no client
 * timestamp). Finally the whole payload is size-capped by the pure helper.
 */
function buildConversationPayload(
  transcript: TurnMessage[],
  systemPrompt: string,
  toolSchemas: unknown[],
  model: string,
  meta: { timezone: string; utcOffsetMinutes: number },
  usage: { promptTokens: number; completionTokens: number },
): ConversationPayload {
  const nowUtc = new Date().toISOString();
  const messages = transcript
    .filter((m) => m.role !== "system")
    .map((m) => {
      const at = (m as { at?: string }).at;
      // Client `at` (user/assistant visitor turns) wins; tool + model-produced
      // entries have none, so stamp the server UTC time they were recorded.
      return { ...m, at: at ?? nowUtc };
    });

  const payload: ConversationPayload = {
    version: 1,
    system: systemPrompt,
    tools: toolSchemas,
    model,
    timezone: meta.timezone,
    utcOffsetMinutes: meta.utcOffsetMinutes,
    messages,
    usage,
  };
  return capConversationPayload(payload);
}

/**
 * Resolve the GuestChat block's agent from the PUBLISHED page. Any miss — page
 * not published, block absent/not a chat, agent unknown or disabled — returns
 * null (the caller answers a uniform 404), so a visitor learns nothing about
 * which of those failed.
 */
async function resolveAgent(pageId: string, blockId: string) {
  const db = await getDb();
  const pages = await db
    .select()
    .from(pageTable)
    .where(eq(pageTable.id, pageId))
    .limit(1);
  const pageRow = pages[0];
  if (!pageRow || pageRow.publishStatus !== "published") return null;

  const published = await getVersion(pageRow.publishedVersionId);
  const blocks = parseJsonColumn<Block[]>(
    pickRenderBlocks(published, null, pageRow.blocks),
    [],
  );
  const block = findGuestChatBlock(blocks, blockId);
  const agentRef = block?.props?.agent;
  if (!block || typeof agentRef !== "string" || agentRef === "") return null;

  const agent = await getChatAgent(agentRef);
  if (!agent || !agent.enabled) return null;
  return agent;
}

/**
 * Build the guest tool defs from the agent's allowlist: load each allowlisted
 * source's saved requests (for placeholder names) and each collection's declared
 * fields, feed the two Maps to `buildGuestTools`. A dangling ref (dead source /
 * collection) simply yields no tool (already handled in `buildGuestTools`). Also
 * returns the collectionFields Map the dispatcher needs to shape query/create/
 * update args.
 */
async function buildTools(config: ChatAgentConfig) {
  const savedRequests = new Map<string, { placeholders: string[] }>();
  const sourceIds = new Set(config.dataSources.map((d) => d.sourceId));
  await Promise.all(
    [...sourceIds].map(async (sourceId) => {
      const source = await getDataSource(sourceId);
      if (!source) return;
      const requests = await listDataSourceRequests(sourceId);
      for (const r of requests) {
        savedRequests.set(`${sourceId}:${r.id}`, {
          placeholders: requestPlaceholders({
            path: r.path,
            query: r.query,
            bodyTemplate: r.bodyTemplate,
          }),
        });
      }
    }),
  );

  const collectionFields = new Map<string, string[]>();
  const tableNames = new Set(config.collections.map((c) => c.collection));
  await Promise.all(
    [...tableNames].map(async (tableName) => {
      const view = await getCollection(tableName);
      if (view) collectionFields.set(tableName, view.fields.map((f) => f.name));
    }),
  );

  const tools = buildGuestTools(config, savedRequests, collectionFields);
  return { tools, collectionFields };
}

/**
 * Cached model catalog for `resolveModel` (ids), the model-based output cap
 * (contextLength), and the per-token USD prices the cost counter bills against.
 * Best-effort: unreadable cache → undefined (static allowlist validates,
 * adapter default caps output, cost goes unrecorded).
 */
async function catalogModels(): Promise<
  | ReadonlyArray<{
      id: string;
      contextLength?: number | null;
      inputPrice?: number | null;
      outputPrice?: number | null;
    }>
  | undefined
> {
  try {
    const cache = await getModelCatalogCache();
    return cache?.models;
  } catch {
    return undefined;
  }
}

/**
 * The guest round runner: run each tool call via `runGuestTool` and frame a
 * `tool` event carrying ONLY `{name, ok, id}` — NEVER the args or the result
 * payload (unlike the admin route, which surfaces both to the operator). The
 * full result still feeds the model (round-tripping) via the returned
 * `ToolResult`, but the visitor's stream leaks nothing.
 */
function guestRunToolsRound(ctx: GuestToolContext) {
  return async (
    calls: { id: string; name: string; args: unknown }[],
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
  ): Promise<ToolResult[]> => {
    const results: ToolResult[] = [];
    for (const call of calls) {
      const data = await runGuestTool(ctx, call.name, call.args);
      controller.enqueue(
        encoder.encode(frameEvent("tool", { name: data.name, ok: data.ok, id: call.id })),
      );
      results.push({ name: data.name, data });
    }
    return results;
  };
}
