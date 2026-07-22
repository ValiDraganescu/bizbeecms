/**
 * public-guest-chatbots — single-conversation download + delete for the admin
 * viewer.
 *
 *   GET               → the conversation as a gateway-fidelity JSON DOWNLOAD:
 *                       the stored `payload` (already gateway-shaped) is parsed
 *                       and wrapped with the row's admin metadata
 *                       ({ conversationId, agent, pageId, blockId, messageCount,
 *                       createdAt, updatedAt, ...payload }). Served as an
 *                       attachment (`Content-Disposition`); `?download=0` returns
 *                       the same JSON inline for a future in-UI viewer.
 *   DELETE            → remove the conversation (operator cleanup).
 *
 * Both are SCOPED to the agent (store guards cross-agent access) and 404 when the
 * agent or the conversation is missing. Admin-gated, REST-only.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getChatAgent } from "@/db/chat-agent-store";
import { deleteConversation, getConversation } from "@/db/chat-conversation-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; convId: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id, convId } = await params;
  const inline = new URL(request.url).searchParams.get("download") === "0";

  try {
    const agent = await getChatAgent(id);
    if (!agent) return Response.json({ error: "not found" }, { status: 404 });
    const row = await getConversation(agent.id, convId);
    if (!row) return Response.json({ error: "not found" }, { status: 404 });

    // The stored payload is the gateway-fidelity JSON string; spread it under the
    // admin envelope so a download is a single self-describing document.
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const document = {
      conversationId: row.id,
      agent: { id: agent.id, name: agent.name },
      pageId: row.pageId,
      blockId: row.blockId,
      messageCount: row.messageCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...payload,
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!inline) {
      headers["Content-Disposition"] = `attachment; filename="conversation-${convId}.json"`;
    }
    return new Response(JSON.stringify(document, null, 2), { headers });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read conversation" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id, convId } = await params;

  try {
    const agent = await getChatAgent(id);
    if (!agent) return Response.json({ error: "not found" }, { status: 404 });
    const removed = await deleteConversation(agent.id, convId);
    if (!removed) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to delete conversation" },
      { status: 500 },
    );
  }
}
