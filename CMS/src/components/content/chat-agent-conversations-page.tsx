"use client";

/**
 * Client body of /admin/chat-agents/[id]/conversations — the per-agent guest
 * CONVERSATIONS page (usage summary + the paginated conversation list with
 * download/delete), promoted out of the edit form so transcripts are one click
 * from the agents list instead of buried in the editor. Fetches the agent only
 * to headline its name; the panels own their own data. REST-only; hardcoded
 * English copy (list-page pattern).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ConversationsPanel,
  UsagePanel,
  ghostBtn,
  readError,
  type Agent,
} from "@/components/content/chat-agents-shared";

export function ChatAgentConversationsPage({ id }: { id: string }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/chat-agents/${id}`);
        if (!res.ok) throw new Error(await readError(res));
        const a = (await res.json()) as Agent;
        if (!cancelled) setAgent(a);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/chat-agents" className={ghostBtn}>
          ← All chat agents
        </Link>
        <Link href={`/admin/chat-agents/${id}`} className={ghostBtn}>
          Edit this agent
        </Link>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}

      {!agent && !error && (
        <p role="status" className="text-foreground-muted">
          Loading…
        </p>
      )}

      {agent && (
        <>
          <h2 className="text-lg font-medium text-foreground">{agent.name}</h2>
          <div className="rounded-lg border border-border bg-surface-raised p-4">
            <UsagePanel agentId={agent.id} />
          </div>
          <div className="rounded-lg border border-border bg-surface-raised p-4">
            <ConversationsPanel agentId={agent.id} />
          </div>
        </>
      )}
    </div>
  );
}
