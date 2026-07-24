/**
 * chat-agent-export-import — export selected agents as ONE portable bundle.
 *
 *   GET ?names=<a,b,c> → a `bizbeecms.agents` v1 JSON download carrying, per
 *   agent: name, systemPrompt, model, enabled, welcomeMessage, limits,
 *   dataSources, collections. NO ids, timestamps, conversations, or usage.
 *   Any missing requested name → 404, never a silently partial export
 *   (components-export doctrine).
 *
 * Read-only (no trust boundary — output, not input). Admin-gated, REST-only.
 * Pure envelope logic in `lib/public-chat/portable.ts`; the `?names=` parsing
 * and selection reuse the generic kit helpers.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { listChatAgents, type ChatAgentRow } from "@/db/chat-agent-store";
import { parseNamesParam, selectByNames } from "@/lib/components/kit-zip";
import { parseAgentConfig } from "@/lib/public-chat/core";
import {
  agentsExportFilename,
  buildAgentsBundle,
  type PortableAgent,
} from "@/lib/public-chat/portable";

export const dynamic = "force-dynamic";

/** Strip a row to its portable form: config parsed, no id/timestamps. */
function toPortable(row: ChatAgentRow): PortableAgent {
  const config = parseAgentConfig(row.limits, row.dataSources, row.collections);
  return {
    name: row.name,
    systemPrompt: row.systemPrompt,
    model: row.model,
    enabled: row.enabled,
    welcomeMessage: row.welcomeMessage,
    ...config,
  };
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const names = parseNamesParam(new URL(request.url).searchParams.get("names") ?? "");
  if (names.length === 0) {
    return Response.json({ error: "names is required (comma-separated agent names)" }, { status: 400 });
  }
  try {
    const rows = await listChatAgents();
    const { selected, missing } = selectByNames(rows, names);
    if (missing.length > 0) {
      return Response.json(
        { error: `no such chat agent(s): ${missing.join(", ")}` },
        { status: 404 },
      );
    }
    const bundle = buildAgentsBundle(selected.map(toPortable), new Date().toISOString());
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${agentsExportFilename(names)}"`,
      },
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to export chat agents" },
      { status: 500 },
    );
  }
}
