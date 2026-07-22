/**
 * public-guest-chatbots — per-agent conversation LIST for the admin viewer.
 *
 *   GET ?limit=&offset= → { conversations, total }
 *     `limit` clamps to [1, 100] (default 25); a missing / unparseable value uses
 *     the default. `offset` clamps to ≥ 0. Summaries only (no `payload`); newest
 *     first. 404 when the agent is unknown.
 *
 * Admin-gated, REST-only. Reads the `chat_conversation` rows via the store.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getChatAgent } from "@/db/chat-agent-store";
import { listConversations } from "@/db/chat-conversation-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;

  const search = new URL(request.url).searchParams;
  const rawLimit = Number(search.get("limit"));
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), 100)
    : 25;
  const rawOffset = Number(search.get("offset"));
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0;

  try {
    const agent = await getChatAgent(id);
    if (!agent) return Response.json({ error: "not found" }, { status: 404 });
    const { rows, total } = await listConversations(agent.id, { limit, offset });
    return Response.json({ conversations: rows, total });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list conversations" },
      { status: 500 },
    );
  }
}
