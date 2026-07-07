/**
 * Chat export endpoint (ai-widget-ux — PM-SSO debug tool). Produces a COMPLETE,
 * lossless dump of a conversation so an operator can inspect or replay exactly
 * what happened. The download carries BOTH views of the same chat:
 *
 *   - `messages`: the EXACT model-facing history the chat POST route sends —
 *     assembled system prompt + every turn expanded into the structured
 *     `tool_calls` / `role:"tool"` protocol (via the client's buildModelHistory).
 *   - `transcript`: the RAW widget transcript VERBATIM — user turns with their
 *     `media` (uploaded images), assistant turns with `parts` (text + tool + any
 *     reasoning) and each tool card's full `input`/`output`. Nothing is reduced.
 *
 * Plus the resolved `model`, the tool definitions, the real request `params`
 * (max_tokens/stream/stream_options — mirrors what the chat route sends to the
 * provider), and `meta` (context, prompt source, model context length, lastError,
 * exportedAt). Between them the file is self-contained: system prompt, page-scoped
 * context, model + parameters, all messages, all tool I/O, all uploaded images,
 * all reasoning — everything needed to understand or reproduce the run.
 *
 * It's a POST (not GET) on purpose: the MESSAGES live client-side, so the dump can
 * only be assembled if the client sends them — same body shape as `POST /api/chat`,
 * plus the raw `transcript`. We re-run the same pure assembly WITHOUT calling the
 * model.
 *
 * PM-SSO operators ONLY — gated on the SERVER (`requirePmSso`, 403 for non-SSO).
 * The button is also hidden for non-SSO users, but this route is the real gate.
 * REST-only (PM directive).
 */
import { parseChatBody } from "@/lib/chat/sse";
import { resolveRequestContext } from "@/lib/chat/tool-scopes";
import { assembleSystemPrompt } from "@/lib/chat/assemble-prompt";
import { toolSchemasForContext } from "@/lib/chat/tool-dispatch";
import { resolveModel, outputCapFor } from "@/lib/chat/models";
import { DEFAULT_MAX_TOKENS } from "@/lib/ports/ai";
import { getModelCatalogCache } from "@/db/settings-store";
import { requirePmSso } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const denied = await requirePmSso(request);
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

  const b = (typeof body === "object" && body !== null ? body : {}) as {
    context?: unknown;
    pathname?: unknown;
    model?: unknown;
    lastError?: unknown;
    transcript?: unknown;
  };
  const context = resolveRequestContext(b.context, b.pathname);
  // The last upstream/request error from the failing conversation (e.g. xAI 7003),
  // forwarded by the client so a FAILED chat's export carries the real reason.
  const lastError = typeof b.lastError === "string" && b.lastError !== "" ? b.lastError : null;
  // The RAW widget transcript, forwarded verbatim (user media, assistant parts,
  // full tool input/output). Echoed back untouched so the dump is lossless — the
  // route never reduces or validates it (that's what `messages` is for).
  const transcript = Array.isArray(b.transcript) ? b.transcript : null;

  // Resolve the model id exactly like the chat route (validate against catalog
  // ids; never throws; falls back to DEFAULT_MODEL). Keep the full catalog row so
  // we can report the model's context length + the derived output cap (max_tokens).
  let catalogIds: ReadonlySet<string> | undefined;
  let catalogModels: ReadonlyArray<{ id: string; contextLength?: number | null }> | undefined;
  try {
    const cache = await getModelCatalogCache();
    if (cache) {
      catalogModels = cache.models;
      catalogIds = new Set(cache.models.map((m) => m.id));
    }
  } catch {
    /* cache read failed — static allowlist still validates; contextLength null */
  }
  const model = resolveModel(b.model, catalogIds);
  const contextLength =
    catalogModels?.find((m) => m.id === model)?.contextLength ?? null;
  // The real per-request params the chat route sends to the provider (ports/ai):
  // stream + include_usage always on; max_tokens is the model's output cap or the
  // shared default. No temperature is set — the provider default applies.
  const maxTokens = outputCapFor(contextLength) ?? DEFAULT_MAX_TOKENS;
  const params = {
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: maxTokens,
  };

  // Same assembly as the POST route's `withSystemPrompt`: prepend the system
  // prompt unless the client already supplied one. Record which it was so the dump
  // names its prompt source.
  let messages = parsed.messages;
  let promptSource: "assembled-default" | "client-supplied" = "client-supplied";
  if (!messages.some((m) => m.role === "system")) {
    let system: string;
    try {
      system = await assembleSystemPrompt(context);
    } catch (err) {
      return Response.json(
        { error: `failed to assemble prompt: ${(err as Error).message}` },
        { status: 502 },
      );
    }
    messages = [{ role: "system", content: system }, ...messages];
    promptSource = "assembled-default";
  }

  const tools = toolSchemasForContext(context);

  return Response.json(
    {
      // Resolved model + the REAL request params the chat route sends the provider.
      model,
      params,
      // The exact model-facing history (system prompt + structured tool protocol).
      messages,
      // The tool definitions in scope for this context.
      tools,
      // The RAW transcript verbatim — the lossless record (null if the client, e.g.
      // an older build, didn't send it; `messages` still carries the model view).
      transcript,
      // Everything else needed to understand/reproduce the run.
      meta: {
        context,
        promptSource,
        modelContextLength: contextLength,
        ...(lastError ? { lastError } : {}),
        exportedAt: new Date().toISOString(),
      },
      // Kept at the top level too for back-compat with existing tooling/readers.
      context,
      ...(lastError ? { lastError } : {}),
      exportedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="chat-payload-${context}.json"`,
      },
    },
  );
}
