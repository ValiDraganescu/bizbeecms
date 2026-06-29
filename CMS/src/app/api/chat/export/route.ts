/**
 * Chat export endpoint (ai-widget-ux — PM-SSO debug tool). Returns the EXACT
 * payload the chat POST route would send to the model for a given transcript:
 * the assembled system prompt + every transcript message + the tool definitions
 * + the resolved model id. The widget downloads this as a `.json` file so an
 * operator can inspect/replay what the model actually receives.
 *
 * It's a POST (not GET) on purpose: the transcript MESSAGES live client-side, so
 * the "exact payload" can only be assembled if the client sends them — same body
 * shape as `POST /api/chat`. We re-run the same pure assembly (`withSystemPrompt`
 * equivalent + `toolSchemasForContext` + `resolveModel`) WITHOUT calling the model.
 *
 * PM-SSO operators ONLY — gated on the SERVER (`requirePmSso`, 403 for non-SSO).
 * The button is also hidden for non-SSO users, but this route is the real gate.
 * REST-only (PM directive).
 */
import { parseChatBody } from "@/lib/chat/sse";
import { resolveRequestContext } from "@/lib/chat/tool-scopes";
import { assembleSystemPrompt } from "@/lib/chat/assemble-prompt";
import { toolSchemasForContext } from "@/lib/chat/tool-dispatch";
import { resolveModel } from "@/lib/chat/models";
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
  };
  const context = resolveRequestContext(b.context, b.pathname);
  // The last upstream/request error from the failing conversation (e.g. xAI 7003),
  // forwarded by the client so a FAILED chat's export carries the real reason.
  const lastError = typeof b.lastError === "string" && b.lastError !== "" ? b.lastError : null;

  // Resolve the model id exactly like the chat route (validate against catalog
  // ids; never throws; falls back to DEFAULT_MODEL).
  let catalogIds: ReadonlySet<string> | undefined;
  try {
    const cache = await getModelCatalogCache();
    if (cache) catalogIds = new Set(cache.models.map((m) => m.id));
  } catch {
    /* cache read failed — static allowlist still validates */
  }
  const model = resolveModel(b.model, catalogIds);

  // Same assembly as the POST route's `withSystemPrompt`: prepend the system
  // prompt unless the client already supplied one.
  let messages = parsed.messages;
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
  }

  const tools = toolSchemasForContext(context);

  return Response.json(
    {
      context,
      model,
      messages,
      tools,
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
