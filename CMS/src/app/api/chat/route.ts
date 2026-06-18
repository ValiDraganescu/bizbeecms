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
import {
  SseDeltaParser,
  ToolCallAccumulator,
  frameEvent,
  parseChatBody,
} from "@/lib/chat/sse";
import {
  CREATE_COMPONENT_TOOL,
  validateComponentArtifact,
} from "@/lib/chat/component-tool";
import { CREATE_PAGE_TOOL, validatePageInput } from "@/lib/chat/page-tool";
import {
  CREATE_TRANSLATION_TOOL,
  validateTranslationInput,
} from "@/lib/chat/translate-tool";
import {
  LIST_ASSETS_TOOL,
  coerceLimit,
  formatAssetList,
} from "@/lib/chat/list-assets-tool";
import { listComponentNames, upsertComponent } from "@/db/component-store";
import { missingComponents, upsertPage } from "@/db/page-store";
import { applyTranslation } from "@/db/translate-store";
import { getContentLocales, getSiteIdentity } from "@/db/settings-store";
import { listAssets } from "@/db/asset-store";
import { buildSystemPrompt } from "@/lib/settings/site-settings";
import { allowedClasses } from "@/lib/render/utility-css";

export const dynamic = "force-dynamic";

// Default Workers AI model. Swappable per the B1 risk note: AI Gateway lets us
// point at a stronger model without re-architecting if tool-calling needs it.
const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// The tools the model may call this turn (B2 create_component, B3 create_page,
// B4 translate).
const TOOLS = [
  CREATE_COMPONENT_TOOL,
  CREATE_PAGE_TOOL,
  CREATE_TRANSLATION_TOOL,
  LIST_ASSETS_TOOL,
];

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

  // Prepend a system prompt built from the Site's identity (E2 brand/design/AI
  // persona) + its existing components + the bounded utility-class vocabulary, so
  // generated artifacts match the Site and reference real components/classes.
  // Only if the client didn't already supply a system message.
  const messages = await withSystemPrompt(parsed.messages);

  let upstream: ReadableStream<Uint8Array>;
  try {
    // OpenAI-compatible streaming call through AI Gateway.
    upstream = (await ai.run(
      DEFAULT_MODEL as Parameters<Ai["run"]>[0],
      { messages, stream: true, tools: TOOLS } as Parameters<
        Ai["run"]
      >[1],
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

type ChatMessage = { role: string; content: string };

/**
 * Build the E2 system prompt (Site identity + components + utility classes) and
 * prepend it to the conversation — unless the client already sent a system
 * message (it owns the prompt then). Reads are defensive: an unbound D1 (no Site
 * provisioned, or this offline env) falls back to an empty identity / no
 * components, so the base instruction still ships.
 */
async function withSystemPrompt(messages: ChatMessage[]): Promise<ChatMessage[]> {
  if (messages.some((m) => m.role === "system")) return messages;

  let identity;
  let componentNames: string[] = [];
  try {
    identity = await getSiteIdentity();
  } catch {
    /* unbound D1 → no identity */
  }
  try {
    componentNames = await listComponentNames();
  } catch {
    /* unbound D1 → no components */
  }

  const system = buildSystemPrompt({
    identity,
    componentNames,
    utilityClasses: [...allowedClasses()].sort(),
  });
  return [{ role: "system", content: system }, ...messages];
}

/**
 * Pipe the upstream OpenAI-style SSE stream through the pure parser and emit our
 * client protocol. Keeps the network/stream wiring thin; all decisions live in
 * the unit-tested `SseDeltaParser` / `ToolCallAccumulator` / validator.
 *
 * B2: as the model streams, text deltas frame as `token`. Tool-call fragments
 * (`create_component`) accumulate; when the stream ends we assemble each call,
 * VALIDATE the artifact (pure), write it to D1, and frame a `tool` result event
 * (`{name, ok, action|errors}`) so the client can show "created PricingCard" or
 * the validation errors. This is a SINGLE tool round — feeding the tool result
 * back for a follow-up model turn (the full agentic loop) needs the live model
 * and is deferred to the live path (HITL). A reframe with no tool call behaves
 * exactly like B1 (token… done).
 */
function reframe(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const parser = new SseDeltaParser();
  const tools = new ToolCallAccumulator();
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

/**
 * Run the accumulated tool calls and frame a `tool` event per call. Dispatches
 * by tool name (B2 `create_component`, B3 `create_page`). Each result is
 * `{name, ok, action|errors|...}`. Failures (validation or D1) are surfaced as
 * `ok:false` events, never thrown — one bad tool call must not kill the stream.
 */
async function runTools(
  tools: ToolCallAccumulator,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  const emit = (data: Record<string, unknown>) =>
    controller.enqueue(encoder.encode(frameEvent("tool", data)));

  for (const call of tools.finish()) {
    try {
      if (call.name === CREATE_COMPONENT_TOOL.function.name) {
        await handleCreateComponent(call.args, emit);
      } else if (call.name === CREATE_PAGE_TOOL.function.name) {
        await handleCreatePage(call.args, emit);
      } else if (call.name === CREATE_TRANSLATION_TOOL.function.name) {
        await handleTranslate(call.args, emit);
      } else if (call.name === LIST_ASSETS_TOOL.function.name) {
        await handleListAssets(call.args, emit);
      } else {
        emit({ name: call.name, ok: false, errors: [`unknown tool: ${call.name}`] });
      }
    } catch (err) {
      emit({ name: call.name, ok: false, errors: [(err as Error).message] });
    }
  }
}

async function handleCreateComponent(
  args: unknown,
  emit: (data: Record<string, unknown>) => void,
): Promise<void> {
  const name = CREATE_COMPONENT_TOOL.function.name;
  const valid = validateComponentArtifact(args);
  if (!valid.ok) {
    emit({ name, ok: false, errors: valid.errors });
    return;
  }
  try {
    const res = await upsertComponent(valid.artifact);
    emit({ name, ok: true, action: res.action, component: res.name });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to save component: ${(err as Error).message}`] });
  }
}

async function handleCreatePage(
  args: unknown,
  emit: (data: Record<string, unknown>) => void,
): Promise<void> {
  const name = CREATE_PAGE_TOOL.function.name;
  const valid = validatePageInput(args);
  if (!valid.ok) {
    emit({ name, ok: false, errors: valid.errors });
    return;
  }
  try {
    // The blocks reference component names — verify they exist before writing,
    // so the model learns to create_component first (not silent placeholders).
    const missing = await missingComponents(valid.componentNames);
    if (missing.length > 0) {
      emit({
        name,
        ok: false,
        errors: [`unknown components (create them first): ${missing.join(", ")}`],
      });
      return;
    }
    const res = await upsertPage(valid.page);
    if (!res.ok) {
      emit({ name, ok: false, errors: res.errors });
      return;
    }
    emit({ name, ok: true, action: res.action, page: res.slug });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to save page: ${(err as Error).message}`] });
  }
}

async function handleTranslate(
  args: unknown,
  emit: (data: Record<string, unknown>) => void,
): Promise<void> {
  const name = CREATE_TRANSLATION_TOOL.function.name;
  // Constrain the model to the Site's configured content locales (C1), so it
  // can't invent locales the Site doesn't serve.
  let allowedLocales: string[] | undefined;
  try {
    allowedLocales = (await getContentLocales()).locales;
  } catch {
    allowedLocales = undefined; // settings unreadable → accept any valid code
  }
  const valid = validateTranslationInput(args, { allowedLocales });
  if (!valid.ok) {
    emit({ name, ok: false, errors: valid.errors });
    return;
  }
  try {
    const res = await applyTranslation(valid.input);
    if (!res.ok) {
      emit({ name, ok: false, errors: res.errors });
      return;
    }
    emit({ name, ok: true, action: res.action, target: res.target, fields: res.fields });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to translate: ${(err as Error).message}`] });
  }
}

/**
 * Read-only: list the Site's uploaded media so the model can reference real
 * `/media/<key>` URLs in components/pages (closes the D1 upload→AI-use loop).
 * No untrusted artifact to validate — just clamp the limit and shape the rows.
 */
async function handleListAssets(
  args: unknown,
  emit: (data: Record<string, unknown>) => void,
): Promise<void> {
  const name = LIST_ASSETS_TOOL.function.name;
  try {
    const rows = await listAssets();
    const assets = formatAssetList(rows, coerceLimit(args));
    emit({ name, ok: true, assets });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to list assets: ${(err as Error).message}`] });
  }
}
