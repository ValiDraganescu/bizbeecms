/**
 * public-guest-chatbots Slice 7 — single chat-agent endpoint.
 *
 *   GET    → one agent (404 when absent); config parsed, never raw JSON.
 *   PUT    → full-replace update (same strict validation as create); 404 when
 *            the id is unknown, 400 `{errors}` on bad config, 409 on a name clash
 *            with a DIFFERENT agent.
 *   DELETE → remove the agent (404 when absent).
 *
 * Admin-gated, REST-only. `serializeAgent` / `buildAgentInput` are shared with the
 * collection route so the wire shape and validation stay in one place.
 */
import { requireAdmin } from "@/lib/auth/guard";
import {
  deleteChatAgent,
  getChatAgent,
  updateChatAgent,
} from "@/db/chat-agent-store";
import { buildAgentInput, serializeAgent } from "../route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const agent = await getChatAgent(id);
    if (!agent) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(serializeAgent(agent));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read chat agent" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const built = buildAgentInput(body);
  if (!built.ok) return Response.json(built.payload, { status: built.status });

  try {
    const result = await updateChatAgent(id, built.value);
    if (result === null) return Response.json({ error: "not found" }, { status: 404 });
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
    return Response.json(serializeAgent(result.agent));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to update chat agent" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const removed = await deleteChatAgent(id);
    if (!removed) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to delete chat agent" },
      { status: 500 },
    );
  }
}
