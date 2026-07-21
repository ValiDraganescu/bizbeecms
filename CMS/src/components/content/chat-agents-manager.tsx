"use client";

/**
 * public-guest-chatbots Slice 7 — the ChatAgents management UI.
 *
 * Lists agents (name, enabled toggle, model, today's messages) with create /
 * delete, and an expandable per-agent editor: name, enabled, system prompt,
 * model (the shared searchable `ModelPicker` over the catalog), welcome message,
 * the seven usage limits (via `NumberInput`), and the data-source + collection
 * allowlists. A usage panel shows last-7-days messages/tokens.
 *
 * REST-only (no server actions); server validation (lib/public-chat/core) is the
 * source of truth — the client disables incomplete forms and surfaces server
 * errors. Delete uses the in-app ConfirmModal (never native confirm). Copy is
 * hardcoded English (this minimal surface predates a translated key set).
 */

import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/content/confirm-modal";
import { ModelPicker } from "@/components/chat/model-picker";
import type {
  ChatAgentLimits,
  CollectionAllowEntry,
  DataSourceAllowEntry,
} from "@/lib/public-chat/core";
import {
  CollectionRows,
  DataSourceRows,
  LimitsFields,
  UsagePanel,
  dangerBtn,
  ghostBtn,
  helpCls,
  inputCls,
  labelCls,
  primaryBtn,
  readError,
  type Agent,
  type Collection,
  type Source,
} from "@/components/content/chat-agents-shared";

/** The editable draft — limits are partial (blank = default). */
type Draft = {
  name: string;
  enabled: boolean;
  model: string | null;
  welcomeMessage: string;
  systemPrompt: string;
  limits: Partial<ChatAgentLimits>;
  dataSources: DataSourceAllowEntry[];
  collections: CollectionAllowEntry[];
};

/**
 * Seed a draft from an existing agent, or blank for a new one. Existing limits
 * are passed through whole (the editor still lets operators clear a field back to
 * its default); a new agent starts with empty limits so every field shows its
 * default placeholder.
 */
function draftFrom(agent?: Agent): Draft {
  return {
    name: agent?.name ?? "",
    enabled: agent?.enabled ?? true,
    model: agent?.model ?? null,
    welcomeMessage: agent?.welcomeMessage ?? "",
    systemPrompt: agent?.systemPrompt ?? "",
    limits: agent ? { ...agent.limits } : {},
    dataSources: agent ? agent.dataSources.map((e) => ({ ...e })) : [],
    collections: agent ? agent.collections.map((e) => ({ ...e })) : [],
  };
}

export function ChatAgentsManager() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
            {editingId === agent.id ? (
              <AgentEditor
                agent={agent}
                sources={sources}
                collections={collections}
                onDone={async () => {
                  setEditingId(null);
                  await load();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
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
                  <button
                    type="button"
                    className={ghostBtn}
                    aria-label={`Edit — ${agent.name}`}
                    onClick={() => setEditingId(agent.id)}
                  >
                    Edit
                  </button>
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
            )}
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

/* --------------------------------------------------------------- agent editor */

function AgentEditor({
  agent,
  sources,
  collections,
  onDone,
  onCancel,
}: {
  agent?: Agent;
  sources: Source[];
  collections: Collection[];
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(agent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave =
    draft.name.trim() !== "" && draft.systemPrompt.trim() !== "" && !busy;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        enabled: draft.enabled,
        model: draft.model,
        welcomeMessage: draft.welcomeMessage.trim() || null,
        systemPrompt: draft.systemPrompt.trim(),
        limits: draft.limits,
        dataSources: draft.dataSources,
        collections: draft.collections,
      };
      const res = await fetch(
        agent ? `/api/chat-agents/${agent.id}` : "/api/chat-agents",
        {
          method: agent ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error(await readError(res));
      await onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="text-lg font-medium text-foreground">
        {agent ? "Edit chat agent" : "New chat agent"}
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Name</span>
          <input
            className={inputCls}
            value={draft.name}
            maxLength={100}
            required
            onChange={(e) => set("name", e.target.value)}
          />
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          <span className={labelCls}>Enabled</span>
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <span className={labelCls}>Model</span>
        <ModelPicker
          value={draft.model ?? ""}
          direction="down"
          onChange={(id) => set("model", id || null)}
        />
        <span className={helpCls}>
          Leave unset to use the site&apos;s default model.
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>System prompt</span>
        <textarea
          className={inputCls + " min-h-32"}
          value={draft.systemPrompt}
          required
          placeholder="You are a friendly booking assistant for…"
          onChange={(e) => set("systemPrompt", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Welcome message</span>
        <input
          className={inputCls}
          value={draft.welcomeMessage}
          maxLength={500}
          placeholder="Hi! How can I help you today?"
          onChange={(e) => set("welcomeMessage", e.target.value)}
        />
      </label>

      <LimitsFields limits={draft.limits} onChange={(l) => set("limits", l)} />

      <DataSourceRows
        entries={draft.dataSources}
        sources={sources}
        onChange={(d) => set("dataSources", d)}
      />

      <CollectionRows
        entries={draft.collections}
        collections={collections}
        onChange={(c) => set("collections", c)}
      />

      {agent && (
        <div className="rounded-md border border-border bg-surface p-3">
          <UsagePanel agentId={agent.id} />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className={primaryBtn} disabled={!canSave}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className={ghostBtn} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
