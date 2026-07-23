/**
 * assistant-conversations — single-conversation download + delete for the admin
 * viewer (the CMS-assistant twin of /api/chat-agents/[id]/conversations/[convId]).
 *
 *   GET    → the conversation as a gateway-fidelity JSON DOWNLOAD: the stored
 *            `payload` (system prompt, tool schemas, verbatim transcript incl.
 *            tool_calls / tool results, usage) wrapped with the row's admin
 *            metadata. Served as an attachment (`Content-Disposition`);
 *            `?download=0` returns the same JSON inline.
 *   DELETE → remove the conversation (operator cleanup).
 *
 * Both are SCOPED to the reserved assistant agent id (the store's cross-agent
 * guard means a guest conversation id 404s here and vice versa). Admin-gated,
 * REST-only.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { ASSISTANT_AGENT_ID } from "@/lib/chat/assistant-conversation";
import { deleteConversation, getConversation } from "@/db/chat-conversation-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ convId: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { convId } = await params;
  const inline = new URL(request.url).searchParams.get("download") === "0";

  try {
    const row = await getConversation(ASSISTANT_AGENT_ID, convId);
    if (!row) return Response.json({ error: "not found" }, { status: 404 });

    // The stored payload is the gateway-fidelity JSON string; spread it under the
    // admin envelope so a download is a single self-describing document.
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const document = {
      conversationId: row.id,
      agent: { id: ASSISTANT_AGENT_ID, name: "CMS Assistant" },
      messageCount: row.messageCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...payload,
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!inline) {
      headers["Content-Disposition"] = `attachment; filename="assistant-conversation-${convId}.json"`;
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
  const { convId } = await params;

  try {
    const removed = await deleteConversation(ASSISTANT_AGENT_ID, convId);
    if (!removed) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to delete conversation" },
      { status: 500 },
    );
  }
}
