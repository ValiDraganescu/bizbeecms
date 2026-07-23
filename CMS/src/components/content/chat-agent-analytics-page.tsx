"use client";

/**
 * Client body of /admin/chat-agents/[id]/analytics — the per-agent usage
 * ANALYTICS page (the last-7-days messages/tokens panel), promoted out of the
 * edit form so usage is one click from the agents list instead of buried in the
 * editor (same promotion the conversations page got). Fetches the agent only to
 * headline its name; the panel owns its own data. REST-only; hardcoded English
 * copy (list-page pattern).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  UsagePanel,
  ghostBtn,
  readError,
  type Agent,
} from "@/components/content/chat-agents-shared";

export function ChatAgentAnalyticsPage({ id }: { id: string }) {
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
        <Link href={`/admin/chat-agents/${id}/conversations`} className={ghostBtn}>
          Conversations
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
            <UsagePanel api={`/api/chat-agents/${agent.id}`} />
          </div>
        </>
      )}
    </div>
  );
}
