/**
 * Chat debug endpoint (ai-assistant goal, Slice 4 — debug view). The widget's
 * debug panel calls `GET /api/chat/debug?context=<ctx>` (or `?pathname=<path>`)
 * to show EXACTLY what the assistant gets for the current admin page: the
 * assembled system prompt + the scoped tool-name list. Same `assembleSystemPrompt`
 * + `toolsForContext` the POST route uses — no fork, so the panel can't drift
 * from reality.
 *
 * Admin-only (it reveals the system prompt). REST-only (PM directive).
 */
import {
  toolsForContext,
  resolveRequestContext,
} from "@/lib/chat/tool-scopes";
import { assembleSystemPrompt } from "@/lib/chat/assemble-prompt";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const context = resolveRequestContext(
    url.searchParams.get("context"),
    url.searchParams.get("pathname"),
  );
  const tools = [...toolsForContext(context)];

  let systemPrompt: string;
  try {
    systemPrompt = await assembleSystemPrompt(context);
  } catch (err) {
    return Response.json(
      { error: `failed to assemble prompt: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  return Response.json({ context, systemPrompt, tools });
}
