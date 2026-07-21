/**
 * public-guest-chatbots Slice 7 — per-agent usage counters.
 *
 *   GET ?days=7 → { usage: [{ day, messages, tokens }, …] } for the last N days
 *                 (most-recent-first). `days` is clamped to [1, 90]; a missing /
 *                 unparseable value defaults to 7. 404 when the agent is unknown.
 *
 * Admin-gated, REST-only. Reads the atomic `usage_counter` rows via the store.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getChatAgent } from "@/db/chat-agent-store";
import { readAgentUsage } from "@/db/usage-counter-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;

  const raw = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 90) : 7;

  try {
    const agent = await getChatAgent(id);
    if (!agent) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ usage: await readAgentUsage(agent.id, days) });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read usage" },
      { status: 500 },
    );
  }
}
