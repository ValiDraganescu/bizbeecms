/**
 * assistant-conversations — CMS-assistant conversation LIST for the admin viewer.
 *
 *   GET ?limit=&offset= → { conversations, total }
 *     `limit` clamps to [1, 100] (default 25); a missing / unparseable value uses
 *     the default. `offset` clamps to ≥ 0. Summaries only (no `payload`); newest
 *     first.
 *
 * Same contract as GET /api/chat-agents/[id]/conversations, but scoped to the
 * reserved assistant agent id (the rows live in the same `chat_conversation`
 * table). Admin-gated, REST-only.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { ASSISTANT_AGENT_ID } from "@/lib/chat/assistant-conversation";
import { listConversations } from "@/db/chat-conversation-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const search = new URL(request.url).searchParams;
  // `Number(null)` is 0, so an ABSENT limit must be caught before coercion or
  // the documented default 25 silently becomes the clamp floor 1.
  const rawLimit = search.get("limit") === null ? NaN : Number(search.get("limit"));
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), 100)
    : 25;
  const rawOffset = Number(search.get("offset"));
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0;

  try {
    const { rows, total } = await listConversations(ASSISTANT_AGENT_ID, {
      limit,
      offset,
    });
    return Response.json({ conversations: rows, total });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list conversations" },
      { status: 500 },
    );
  }
}
