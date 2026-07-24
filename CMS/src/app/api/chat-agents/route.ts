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
import { parseAgentConfig } from "@/lib/public-chat/core";
import { parsePortableAgent, type PortableAgent } from "@/lib/public-chat/portable";

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
 * Flatten a validated portable agent into the `ChatAgentInput` the store expects
 * (config columns `JSON.stringify`'d). Shared with the import route so every
 * write path stores config the same way.
 */
export function toAgentInput(
  agent: PortableAgent,
): import("@/db/chat-agent-store").ChatAgentInput {
  return {
    name: agent.name,
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    enabled: agent.enabled,
    welcomeMessage: agent.welcomeMessage,
    limits: JSON.stringify(agent.limits),
    dataSources: JSON.stringify(agent.dataSources),
    collections: JSON.stringify(agent.collections),
  };
}

/**
 * Validate + normalize a create/update body into the flat `ChatAgentInput` the
 * store expects. Thin wrapper over the SHARED entry validator
 * (`parsePortableAgent` — also the agents-import trust boundary), so CRUD and
 * import can never drift. Returns the input on success, or an error payload +
 * status for the route to return verbatim.
 */
export function buildAgentInput(
  body: unknown,
):
  | { ok: true; value: import("@/db/chat-agent-store").ChatAgentInput }
  | { ok: false; status: number; payload: { error?: string; errors?: string[] } } {
  const parsed = parsePortableAgent(body);
  if (!parsed.ok) return { ok: false, status: 400, payload: { errors: parsed.errors } };
  return { ok: true, value: toAgentInput(parsed.agent) };
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
