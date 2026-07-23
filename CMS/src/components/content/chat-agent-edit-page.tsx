"use client";

/**
 * Client body of /admin/chat-agents/[id] — fetches ONE agent + the allowlist
 * option sources, renders the shared `AgentEditor`, and keeps the AI assistant
 * in sync:
 *   - publishes the agent's FULL config to the chat-agents context channel
 *     (setActiveChatAgentsContext {editing}) so the assistant's next message
 *     already knows exactly which agent is open and what it contains;
 *   - refetches on CHAT_AGENT_MUTATION_EVENT (the assistant changed the agent),
 *     remounting the form via a `key` on the row's updatedAt so the operator
 *     never saves a stale full-replace draft over the assistant's edit.
 *
 * Save/Cancel return to the list page. REST-only; hardcoded English copy
 * (list-page pattern).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentEditor } from "@/components/content/chat-agent-editor";
import { setActiveChatAgentsContext } from "@/lib/chat/chat-agents-context";
import { CHAT_AGENT_MUTATION_EVENT } from "@/lib/chat/page-mutation-signal";
import {
  ghostBtn,
  readError,
  type Agent,
  type Collection,
  type Source,
} from "@/components/content/chat-agents-shared";

export function ChatAgentEditPage({ id }: { id: string }) {
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch(`/api/chat-agents/${id}`);
      if (!res.ok) throw new Error(await readError(res));
      setAgent((await res.json()) as Agent);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Agent + allowlist option sources in parallel — independent reads.
  useEffect(() => {
    void load();
    void (async () => {
      try {
        const res = await fetch("/api/data-sources");
        if (res.ok) setSources((await res.json()) as Source[]);
      } catch {
        /* offline — allowlist source picker stays empty */
      }
    })();
    void (async () => {
      try {
        const res = await fetch("/api/collections");
        if (res.ok) setCollections((await res.json()) as Collection[]);
      } catch {
        /* offline — collection picker stays empty */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Tell the assistant WHICH agent is being edited, with its full config;
  // clear the channel when the page unmounts.
  useEffect(() => {
    if (!agent) return;
    setActiveChatAgentsContext({
      editing: {
        id: agent.id,
        name: agent.name,
        enabled: agent.enabled,
        model: agent.model,
        welcomeMessage: agent.welcomeMessage,
        systemPrompt: agent.systemPrompt,
        limits: agent.limits,
        dataSources: agent.dataSources,
        collections: agent.collections,
      },
    });
  }, [agent]);
  useEffect(() => () => setActiveChatAgentsContext(null), []);

  // The assistant changed this (or some) agent → refetch so the form and the
  // published context reflect the stored row, not a stale draft.
  useEffect(() => {
    const onMutated = () => void load();
    window.addEventListener(CHAT_AGENT_MUTATION_EVENT, onMutated);
    return () => window.removeEventListener(CHAT_AGENT_MUTATION_EVENT, onMutated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const backToList = () => router.push("/admin/chat-agents");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/chat-agents" className={ghostBtn}>
          ← All chat agents
        </Link>
        <Link href={`/admin/chat-agents/${id}/analytics`} className={ghostBtn}>
          Analytics
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
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <AgentEditor
            key={agent.updatedAt}
            agent={agent}
            sources={sources}
            collections={collections}
            onDone={backToList}
            onCancel={backToList}
          />
        </div>
      )}
    </div>
  );
}
