/**
 * assistant-conversations — daily usage counters for the CMS assistant.
 *
 *   GET ?days=7 → { usage: [{ day, messages, tokens, costNanoUsd }, …] } for the
 *                 last N days (most-recent-first; costNanoUsd is the BILLABLE
 *                 cost in integer nano-USD — the same figure charged against the
 *                 Site's monthly AI quota). `days` clamps to [1, 90]; default 7.
 *
 * Same contract as GET /api/chat-agents/[id]/usage — the counters share the
 * `chat:<agentId>:<day>:…` key scheme under the reserved assistant agent id.
 * Admin-gated, REST-only.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { ASSISTANT_AGENT_ID } from "@/lib/chat/assistant-conversation";
import { readAgentUsage } from "@/db/usage-counter-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  // `Number(null)` is 0, so an ABSENT param must be caught before coercion or
  // the documented default 7 silently becomes the clamp floor 1.
  const raw = new URL(request.url).searchParams.get("days");
  const parsed = raw === null ? NaN : Number(raw);
  const days = Number.isFinite(parsed)
    ? Math.min(Math.max(Math.floor(parsed), 1), 90)
    : 7;

  try {
    return Response.json({ usage: await readAgentUsage(ASSISTANT_AGENT_ID, days) });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read usage" },
      { status: 500 },
    );
  }
}
