"use client";

/**
 * public-guest-chatbots Slice 7 — the ChatAgents management UI (list page).
 *
 * Lists agents (name, enabled badge, model) with create + delete; EDITING lives
 * on the per-agent sub-page /admin/chat-agents/[id] (the Edit button navigates
 * there). The "Add chat agent" flow stays inline via the shared `AgentEditor`.
 *
 * AI-assistant awareness: publishes the agent roster to the chat-agents context
 * channel (so the assistant needs no list_chat_agents round-trip) and refetches
 * when the assistant mutates an agent (CHAT_AGENT_MUTATION_EVENT).
 *
 * REST-only (no server actions); server validation (lib/public-chat/core) is the
 * source of truth. Delete uses the in-app ConfirmModal (never native confirm).
 * Copy is hardcoded English (this minimal surface predates a translated key set).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConfirmModal } from "@/components/content/confirm-modal";
import { AgentEditor } from "@/components/content/chat-agent-editor";
import { setActiveChatAgentsContext } from "@/lib/chat/chat-agents-context";
import { CHAT_AGENT_MUTATION_EVENT } from "@/lib/chat/page-mutation-signal";
import {
  dangerBtn,
  ghostBtn,
  primaryBtn,
  readError,
  type Agent,
  type Collection,
  type Source,
} from "@/components/content/chat-agents-shared";

export function ChatAgentsManager() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/chat-agents");
      if (!res.ok) throw new Error(await readError(res));
      setAgents((await res.json()) as Agent[]);
    } catch (err) {
      setError((err as Error).message);
      setAgents([]);
    }
  }

  // Load agents plus the allowlist option sources in parallel — independent reads.
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
  }, []);

  // Publish the roster to the assistant's context channel; clear when leaving.
  useEffect(() => {
    if (agents === null) return;
    setActiveChatAgentsContext({
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        enabled: a.enabled,
        model: a.model,
        dataSourceTools: a.dataSources.length,
        collectionTools: a.collections.length,
      })),
    });
  }, [agents]);
  useEffect(() => () => setActiveChatAgentsContext(null), []);

  // Refetch (and thereby republish context) when the AI assistant mutates agents.
  useEffect(() => {
    const onMutated = () => void load();
    window.addEventListener(CHAT_AGENT_MUTATION_EVENT, onMutated);
    return () => window.removeEventListener(CHAT_AGENT_MUTATION_EVENT, onMutated);
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat-agents/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      setDeleting(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (agents === null)
    return (
      <p role="status" className="text-foreground-muted">
        Loading…
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}

      {agents.length === 0 && !adding && (
        <p className="text-foreground-muted">No chat agents yet.</p>
      )}

      <ul className="flex flex-col gap-3">
        {agents.map((agent) => (
          <li
            key={agent.id}
            className="rounded-lg border border-border bg-surface-raised p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {agent.name}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                      agent.enabled
                        ? "bg-success-subtle text-success"
                        : "bg-surface-muted text-foreground-muted"
                    }`}
                  >
                    {agent.enabled ? "Enabled" : "Disabled"}
                  </span>
                </p>
                <p className="mt-1 truncate font-mono text-sm text-foreground-muted">
                  {agent.model ?? "site default model"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/admin/chat-agents/${agent.id}/conversations`}
                  className={ghostBtn}
                  aria-label={`Conversations — ${agent.name}`}
                >
                  Conversations
                </Link>
                <Link
                  href={`/admin/chat-agents/${agent.id}`}
                  className={ghostBtn}
                  aria-label={`Edit — ${agent.name}`}
                >
                  Edit
                </Link>
                <button
                  type="button"
                  className={dangerBtn}
                  aria-label={`Delete — ${agent.name}`}
                  onClick={() => setDeleting(agent)}
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <AgentEditor
            sources={sources}
            collections={collections}
            onDone={async () => {
              setAdding(false);
              await load();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <div>
          <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>
            Add chat agent
          </button>
        </div>
      )}

      {deleting && (
        <ConfirmModal
          message={`Delete the chat agent "${deleting.name}"? Pages referencing it will stop responding.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
