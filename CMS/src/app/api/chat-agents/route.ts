/**
 * public-guest-chatbots Slice 7 — chat-agents collection endpoint.
 *
 *   GET  → list agents. Each row's JSON config columns are PARSED through the
 *          tolerant pure core (`parseAgentConfig`) so the client never sees raw
 *          strings — `limits` / `dataSources` / `collections` arrive as objects.
 *   POST { name, systemPrompt, model?, enabled?, welcomeMessage?, limits?,
 *          dataSources?, collections? } → create an agent. Config is validated
 *          STRICTLY (`validateAgentConfigInput`) and stored as `JSON.stringify`'d
 *          columns; 400 `{errors}` on bad config, 409 on a name clash.
 *
 * Admin-gated (`requireAdmin`), REST-only, no server actions (PM directive).
 * The store keeps the JSON columns opaque; the pure core owns the shapes.
 */
import { requireAdmin } from "@/lib/auth/guard";
import {
  createChatAgent,
  listChatAgents,
  type ChatAgentRow,
} from "@/db/chat-agent-store";
import {
  parseAgentConfig,
  validateAgentConfigInput,
  validateWelcomeMessage,
} from "@/lib/public-chat/core";

export const dynamic = "force-dynamic";

/** Serialize a stored row for the client: config parsed, never raw JSON strings. */
export function serializeAgent(row: ChatAgentRow) {
  const config = parseAgentConfig(row.limits, row.dataSources, row.collections);
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    model: row.model,
    welcomeMessage: row.welcomeMessage,
    systemPrompt: row.systemPrompt,
    limits: config.limits,
    dataSources: config.dataSources,
    collections: config.collections,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Validate + normalize a create/update body into the flat `ChatAgentInput` the
 * store expects (config columns already `JSON.stringify`'d). Returns the input on
 * success, or an error payload + status for the route to return verbatim.
 */
export function buildAgentInput(
  body: unknown,
):
  | { ok: true; value: import("@/db/chat-agent-store").ChatAgentInput }
  | { ok: false; status: number; payload: { error?: string; errors?: string[] } } {
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const systemPrompt = typeof obj.systemPrompt === "string" ? obj.systemPrompt.trim() : "";
  const errors: string[] = [];
  if (name === "") errors.push("name is required");
  if (systemPrompt === "") errors.push("systemPrompt is required");

  const checked = validateAgentConfigInput({
    limits: obj.limits,
    dataSources: obj.dataSources,
    collections: obj.collections,
  });
  if (!checked.ok) errors.push(...checked.errors);
  // Plain string or a locale object ({"en":"Hello","fi":"Hei"}) — stored as its
  // string form; the render walk localizes it per visitor content locale.
  const welcome = validateWelcomeMessage(obj.welcomeMessage);
  if (!welcome.ok) errors.push(welcome.error);
  if (errors.length > 0 || !checked.ok || !welcome.ok) {
    return { ok: false, status: 400, payload: { errors } };
  }

  const model =
    typeof obj.model === "string" && obj.model.trim() !== "" ? obj.model.trim() : null;
  const welcomeMessage = welcome.value;

  return {
    ok: true,
    value: {
      name,
      systemPrompt,
      model,
      enabled: obj.enabled !== false, // default enabled unless explicitly false
      welcomeMessage,
      limits: JSON.stringify(checked.value.limits),
      dataSources: JSON.stringify(checked.value.dataSources),
      collections: JSON.stringify(checked.value.collections),
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const rows = await listChatAgents();
    return Response.json(rows.map(serializeAgent));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list chat agents" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const built = buildAgentInput(body);
  if (!built.ok) return Response.json(built.payload, { status: built.status });

  try {
    const result = await createChatAgent(built.value);
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
    return Response.json(serializeAgent(result.agent), { status: 201 });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to create chat agent" },
      { status: 500 },
    );
  }
}
