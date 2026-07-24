/**
 * chat-agent-export-import — import a `bizbeecms.agents` bundle.
 *
 *   POST <bundle JSON> → every agent is created as NEW (existing agents are
 *   NEVER modified): a name clash yields a suffixed copy (`name-2`, `name-3`, …)
 *   honoring the `chat_agent_name_unique` index. Referenced collections /
 *   data-source requests absent on this site are DROPPED from the allowlists,
 *   and the per-agent summary names exactly what was dropped.
 *
 * TRUST BOUNDARY: the file is untrusted operator input. A malformed envelope →
 * 400 with token-naming errors; a malformed ENTRY is rejected + reported while
 * its valid siblings still import (per-agent tolerance). Entry validation is the
 * SAME path the create/update routes use (`parsePortableAgent` → the strict core
 * validators) — no parallel logic. Admin-gated, REST-only.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { createChatAgent, listChatAgents } from "@/db/chat-agent-store";
import { listCollections } from "@/db/collection-store";
import { listDataSourceRequests, listDataSources } from "@/db/data-source-store";
import {
  dataSourceRequestKey,
  parseAgentsBundle,
  vetAgentDeps,
  allocateCopyName,
  type AgentDepCatalog,
} from "@/lib/public-chat/portable";
import { toAgentInput } from "../route";

export const dynamic = "force-dynamic";

/** What this site actually has, for allowlist vetting (drop + warn). */
async function loadDepCatalog(): Promise<AgentDepCatalog> {
  const [collections, sources] = await Promise.all([listCollections(), listDataSources()]);
  const requestLists = await Promise.all(
    sources.map((s) => listDataSourceRequests(s.id)),
  );
  const dataSourceRequests = new Set<string>();
  for (const requests of requestLists) {
    for (const r of requests) {
      dataSourceRequests.add(dataSourceRequestKey(r.sourceId, r.id));
    }
  }
  return {
    collections: new Set(collections.map((c) => c.tableName)),
    dataSourceRequests,
  };
}

/** Per-agent import outcome the UI summarizes. */
type CreatedEntry = { name: string; as: string; dropped: string[] };
type FailedEntry = { name: string; errors: string[] };

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const bundle = parseAgentsBundle(body);
  if (!bundle.ok) return Response.json({ errors: bundle.errors }, { status: 400 });

  try {
    const [catalog, existing] = await Promise.all([loadDepCatalog(), listChatAgents()]);
    const taken = new Set(existing.map((a) => a.name));

    const created: CreatedEntry[] = [];
    const failed: FailedEntry[] = [...bundle.failed];

    for (const entry of bundle.agents) {
      const { agent, dropped } = vetAgentDeps(entry, catalog);
      // Retry on a create-time clash (an agent created concurrently since the
      // list read): treat the clashing name as taken and re-allocate. Bounded so
      // a pathological race can't loop forever.
      let outcome: FailedEntry | CreatedEntry | null = null;
      for (let attempt = 0; attempt < 20 && outcome === null; attempt++) {
        const copyName = allocateCopyName(agent.name, taken);
        const result = await createChatAgent(toAgentInput({ ...agent, name: copyName }));
        if (result.ok) {
          taken.add(copyName);
          outcome = { name: entry.name, as: copyName, dropped };
        } else {
          taken.add(copyName); // clash — retry with the next suffix
        }
      }
      if (outcome === null) {
        outcome = { name: entry.name, errors: ["could not allocate a free copy name"] };
      }
      if ("as" in outcome) created.push(outcome);
      else failed.push(outcome);
    }

    return Response.json({ created, failed });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to import chat agents" },
      { status: 500 },
    );
  }
}
