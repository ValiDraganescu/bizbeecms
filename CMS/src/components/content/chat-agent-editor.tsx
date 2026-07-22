"use client";

/**
 * The chat-agent editor form, shared by the "Add chat agent" flow on
 * /admin/chat-agents and the per-agent edit sub-page /admin/chat-agents/[id]
 * (split out of `chat-agents-manager.tsx` when the edit flow moved to its own
 * route). Name, enabled, system prompt, model (the shared searchable
 * `ModelPicker`), welcome message, the seven usage limits (via `NumberInput`),
 * and the data-source + collection allowlists; existing agents also get the
 * usage panel and a link to the per-agent conversations page
 * (/admin/chat-agents/[id]/conversations — transcripts live there, not here).
 *
 * REST-only (no server actions); server validation (lib/public-chat/core) is
 * the source of truth — the client disables incomplete forms and surfaces
 * server errors. Copy is hardcoded English (this minimal admin surface predates
 * a translated key set).
 */

import { useState } from "react";
import Link from "next/link";
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

export function AgentEditor({
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

      {agent && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
          <span className={helpCls}>
            Guest conversations live on their own page — review, download, or
            delete transcripts there.
          </span>
          <Link
            href={`/admin/chat-agents/${agent.id}/conversations`}
            className={ghostBtn + " shrink-0"}
          >
            View conversations
          </Link>
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
