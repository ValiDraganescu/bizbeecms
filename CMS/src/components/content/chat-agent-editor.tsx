"use client";

/**
 * The chat-agent editor form, shared by the "Add chat agent" flow on
 * /admin/chat-agents and the per-agent edit sub-page /admin/chat-agents/[id]
 * (split out of `chat-agents-manager.tsx` when the edit flow moved to its own
 * route). Name, enabled, system prompt, model (the shared searchable
 * `ModelPicker`), welcome message, the seven usage limits (via `NumberInput`),
 * and the data-source + collection allowlists. Usage analytics and transcripts
 * live on their own sub-pages (/admin/chat-agents/[id]/analytics and
 * …/conversations), reached from the agents list — not here.
 *
 * REST-only (no server actions); server validation (lib/public-chat/core) is
 * the source of truth — the client disables incomplete forms and surfaces
 * server errors. Copy is hardcoded English (this minimal admin surface predates
 * a translated key set).
 */

import { useEffect, useState } from "react";
import { ModelPicker } from "@/components/chat/model-picker";
import {
  LocalePicker,
  useLocalePicker,
} from "@/components/page-builder/locale-picker";
import {
  parseStoredWelcome,
  type ChatAgentLimits,
  type CollectionAllowEntry,
  type DataSourceAllowEntry,
} from "@/lib/public-chat/core";
import {
  CollectionRows,
  DataSourceRows,
  LimitsFields,
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

/** The editable draft — limits are partial (blank = default). The welcome
 *  message is edited PER CONTENT LOCALE (a locale → text map); the "" key holds
 *  a legacy plain-string welcome until the site's locales load and it is
 *  re-homed under the default locale. */
type Draft = {
  name: string;
  enabled: boolean;
  model: string | null;
  welcomeMessage: Record<string, string>;
  systemPrompt: string;
  limits: Partial<ChatAgentLimits>;
  dataSources: DataSourceAllowEntry[];
  collections: CollectionAllowEntry[];
};

/** Seed the per-locale welcome map from the stored value (string or JSON locale object). */
function welcomeDraft(stored: string | null | undefined): Record<string, string> {
  if (!stored) return {};
  const parsed = parseStoredWelcome(stored);
  return typeof parsed === "string" ? { "": parsed } : { ...parsed };
}

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
    welcomeMessage: welcomeDraft(agent?.welcomeMessage),
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

  // Site content locales for the per-locale welcome input (default first, the
  // shape /api/settings/content-locales serves). Until the fetch lands the
  // editor shows a single unlabeled field, same as a one-locale site.
  const [localesCfg, setLocalesCfg] = useState<{ default: string; locales: string[] }>({
    default: "en",
    locales: ["en"],
  });
  const picker = useLocalePicker(localesCfg.locales);
  const { setActive: setPickerActive } = picker;
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/settings/content-locales");
        if (!res.ok) return;
        const j = (await res.json()) as { default?: string; locales?: string[] };
        if (!alive || !j.default || !j.locales?.length) return;
        setLocalesCfg({ default: j.default, locales: j.locales });
        setPickerActive(j.default);
        // Re-home a legacy plain-string welcome under the default locale so it
        // is edited (and saved) as that locale's text.
        setDraft((d) => {
          const plain = d.welcomeMessage[""];
          if (plain === undefined) return d;
          const { "": _legacy, ...rest } = d.welcomeMessage;
          return { ...d, welcomeMessage: { [j.default as string]: plain, ...rest } };
        });
      } catch {
        /* locale fetch failed → single-field editing still works */
      }
    })();
    return () => {
      alive = false;
    };
  }, [setPickerActive]);

  const canSave =
    draft.name.trim() !== "" && draft.systemPrompt.trim() !== "" && !busy;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Per-locale welcome → the API's welcomeMessage: null when empty, a plain
      // string when only one value exists (single-locale site or legacy field),
      // else the locale object the render walk localizes.
      const welcomeEntries = Object.entries(draft.welcomeMessage)
        .map(([k, v]) => [k, v.trim()] as const)
        .filter(([, v]) => v !== "");
      const welcomeMessage =
        welcomeEntries.length === 0
          ? null
          : welcomeEntries.length === 1 &&
              (welcomeEntries[0][0] === "" || localesCfg.locales.length === 1)
            ? welcomeEntries[0][1]
            : Object.fromEntries(welcomeEntries.filter(([k]) => k !== ""));
      const payload = {
        name: draft.name.trim(),
        enabled: draft.enabled,
        model: draft.model,
        welcomeMessage,
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

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className={labelCls}>Welcome message</span>
          <LocalePicker state={picker} label="Welcome message language" />
        </div>
        <input
          className={inputCls}
          value={
            draft.welcomeMessage[picker.active] ?? draft.welcomeMessage[""] ?? ""
          }
          maxLength={500}
          placeholder="Hi! How can I help you today?"
          onChange={(e) =>
            set("welcomeMessage", {
              ...draft.welcomeMessage,
              [picker.active]: e.target.value,
            })
          }
        />
        {localesCfg.locales.length > 1 && (
          <span className={helpCls}>
            Shown in the visitor&apos;s language. A locale left empty falls back
            to the default ({localesCfg.default}).
          </span>
        )}
      </div>

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
