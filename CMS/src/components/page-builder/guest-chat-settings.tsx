"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Block } from "@/lib/render/tree";
import { ctlLabel, ctlInput, SpacingControls } from "./shared";

/** One chat agent as the `GET /api/chat-agents` list returns it (config fields
 *  omitted — the picker only needs identity + enabled state). */
interface ChatAgentOption {
  id: string;
  name: string;
  enabled: boolean;
}

/**
 * Right-rail Block tab when a built-in `GuestChat` block is selected. Mirrors the
 * List/Form settings conventions: `SpacingControls` at the TOP (the standard
 * per-block layout controls, stored as reserved padding/margin props), then the
 * GuestChat-specific config — agent picker, mode, and the copy fields.
 *
 * Every edit flows through the same block-props update path the other panels use
 * (`onProps` patch-merges one block's props; an empty string clears the key, so
 * blank title/placeholder/welcome fall back to the renderer defaults / the
 * agent's welcome message). GuestChat is a schemaless builtin, so
 * `validateBlockProps` keeps its props verbatim.
 *
 * The agent list is fetched from `GET /api/chat-agents`; 403 (non-admin) / offline
 * degrades to an empty list → the picker shows the "no agents" hint linking to the
 * chat-agents admin. PURE prop merges — no store.
 */
export function GuestChatSettings({
  block,
  onProps,
}: {
  block: Block;
  onProps: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const p = (block.props ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");

  const agentRef = s(p.agent);
  const mode = p.mode === "floating" ? "floating" : "inline";
  const showIcon = p.showIcon === true || p.showIcon === "true";
  const title = s(p.title);
  const placeholder = s(p.placeholder);
  const welcome = s(p.welcome);

  const [agents, setAgents] = useState<ChatAgentOption[]>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/chat-agents");
      if (!live || !res.ok) return;
      const body = (await res.json().catch(() => [])) as ChatAgentOption[];
      if (Array.isArray(body)) setAgents(body);
    })();
    return () => {
      live = false;
    };
  }, []);

  // The currently-referenced agent may have been deleted or be out of the fetched
  // list (403); keep it selectable so the ref isn't silently lost on next edit.
  const agentMissing = agentRef !== "" && !agents.some((a) => a.id === agentRef);

  return (
    <section className="space-y-5">
      <h3 className="text-sm font-semibold text-foreground">{t("guestChat.title")}</h3>

      <SpacingControls props={block.props ?? {}} onPatch={onProps} />

      {/* Agent picker — value stores the agent id; the endpoint resolves it. */}
      <label className="flex flex-col gap-1.5">
        <span className={ctlLabel}>{t("guestChat.agent")}</span>
        <select
          value={agentRef}
          onChange={(e) => onProps({ agent: e.target.value })}
          className={ctlInput}
        >
          <option value="">{t("guestChat.agentNone")}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.enabled ? a.name : t("guestChat.agentDisabled", { name: a.name })}
            </option>
          ))}
          {agentMissing && (
            <option value={agentRef}>{t("guestChat.agentMissing", { id: agentRef })}</option>
          )}
        </select>
        {agents.length === 0 && (
          <span className="text-xs text-foreground-muted">
            {t("guestChat.noAgents")}{" "}
            {/* plain <a> (not next/link) — a full reload to the admin is fine. */}
            <a href="/admin/chat-agents" className="underline">
              {t("guestChat.manageAgents")}
            </a>
          </span>
        )}
      </label>

      {/* Mode — inline panel vs floating launcher. */}
      <label className="flex flex-col gap-1.5">
        <span className={ctlLabel}>{t("guestChat.mode")}</span>
        <select
          value={mode}
          onChange={(e) => onProps({ mode: e.target.value })}
          className={ctlInput}
        >
          <option value="inline">{t("guestChat.modeInline")}</option>
          <option value="floating">{t("guestChat.modeFloating")}</option>
        </select>
      </label>

      {/* Chat icon — per-instance opt-in glyph on the launcher + panel header. */}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={showIcon}
          onChange={(e) => onProps({ showIcon: e.target.checked })}
          className="h-4 w-4 accent-[color:var(--color-primary)]"
        />
        <span className={ctlLabel}>{t("guestChat.showIcon")}</span>
      </label>

      {/* Title */}
      <label className="flex flex-col gap-1.5">
        <span className={ctlLabel}>{t("guestChat.label")}</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onProps({ title: e.target.value })}
          className={ctlInput}
        />
      </label>

      {/* Input placeholder */}
      <label className="flex flex-col gap-1.5">
        <span className={ctlLabel}>{t("guestChat.placeholder")}</span>
        <input
          type="text"
          value={placeholder}
          onChange={(e) => onProps({ placeholder: e.target.value })}
          className={ctlInput}
        />
      </label>

      {/* Welcome — blank falls back to the agent's configured welcome message. */}
      <label className="flex flex-col gap-1.5">
        <span className={ctlLabel}>{t("guestChat.welcome")}</span>
        <textarea
          rows={2}
          value={welcome}
          onChange={(e) => onProps({ welcome: e.target.value })}
          className={ctlInput}
        />
        <span className="text-xs text-foreground-muted">{t("guestChat.welcomeHelp")}</span>
      </label>
    </section>
  );
}
