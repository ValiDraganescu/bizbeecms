"use client";

/**
 * Debug view for the AI-assistant widget (ai-assistant goal, Slice 4). Shows
 * what the assistant is working with for the CURRENT admin page: the active
 * tool list (computed client-side from the same pure `toolsForContext`) and the
 * assembled system prompt (fetched from `GET /api/chat/debug`, the same builder
 * the POST route uses). Modeled on aicms `debug_panel.tsx`.
 *
 * ponytail: fetch the prompt only while the panel is open (it's the only thing
 * needing a round-trip); tool names + context are pure/instant. No caching layer
 * — the prompt is cheap and re-derived on demand.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { detectAdminContext, toolsForContext } from "@/lib/chat/tool-scopes";
import type { PromptVersion } from "@/lib/chat/prompt-version";

/** What the export button needs from the live conversation. */
type ChatDebugPanelProps = {
  /** Current transcript (role/content), so export can capture the exact payload. */
  messages?: { role: string; content: string }[];
  /** Selected model id, mirrored into the exported payload. */
  model?: string;
  /** Active per-request system-prompt override (PM-SSO editor), or null. */
  override?: string | null;
  /** Set/clear the override that the widget threads into the chat POST. */
  onOverrideChange?: (prompt: string | null) => void;
};

export function ChatDebugPanel({
  messages = [],
  model,
  override = null,
  onOverrideChange,
}: ChatDebugPanelProps) {
  const t = useTranslations("chat.debug");
  const pathname = usePathname();
  const context = detectAdminContext(pathname);
  const tools = toolsForContext(context);

  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // PM-SSO only: whether to show the "Export chat" control (the route is the gate).
  const [isPmSso, setIsPmSso] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // PM-SSO system-prompt editor (ai-widget-ux): saved versions + an inline
  // editor. A selected version's text becomes the per-request override (lifted
  // to the widget). "New" seeds the editor from the assembled default (`prompt`).
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<string | null>(null); // non-null = editor open
  const [label, setLabel] = useState("");
  const [pvBusy, setPvBusy] = useState(false);
  const [pvError, setPvError] = useState<string | null>(null);

  async function loadVersions() {
    try {
      const res = await fetch("/api/chat/prompts");
      if (!res.ok) return;
      const j = (await res.json()) as { versions?: PromptVersion[] };
      setVersions(j.versions ?? []);
    } catch {
      /* offline / no binding — leave the list as-is */
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/chat/debug?context=${encodeURIComponent(context)}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        return (await res.json()) as { systemPrompt: string; isPmSso?: boolean };
      })
      .then((data) => {
        if (!cancelled) {
          setPrompt(data.systemPrompt);
          setIsPmSso(Boolean(data.isPmSso));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [context]);

  // Load saved versions once we know the operator is PM-SSO.
  useEffect(() => {
    if (isPmSso) void loadVersions();
  }, [isPmSso]);

  // Apply a selected version's prompt as the override (or clear it).
  function selectVersion(id: string) {
    setSelectedId(id);
    setDraft(null);
    setPvError(null);
    if (!id) {
      onOverrideChange?.(null);
      return;
    }
    const v = versions.find((x) => x.id === id);
    onOverrideChange?.(v ? v.prompt : null);
  }

  // Open the editor seeded from the assembled default; the operator edits freely.
  function startNew() {
    setDraft(prompt ?? "");
    setLabel("");
    setPvError(null);
  }

  async function saveVersion() {
    if (draft === null) return;
    setPvBusy(true);
    setPvError(null);
    try {
      const res = await fetch("/api/chat/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, prompt: draft }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { version: PromptVersion };
      setVersions((prev) => [j.version, ...prev]);
      setDraft(null);
      setLabel("");
      // Auto-select the just-saved version so it's active immediately.
      setSelectedId(j.version.id);
      onOverrideChange?.(j.version.prompt);
    } catch (err) {
      setPvError((err as Error).message);
    } finally {
      setPvBusy(false);
    }
  }

  async function deleteVersion() {
    if (!selectedId) return;
    setPvBusy(true);
    setPvError(null);
    try {
      const res = await fetch(`/api/chat/prompts?id=${encodeURIComponent(selectedId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setVersions((prev) => prev.filter((x) => x.id !== selectedId));
      selectVersion("");
    } catch (err) {
      setPvError((err as Error).message);
    } finally {
      setPvBusy(false);
    }
  }

  async function exportChat() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/chat/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Drop empty-content turns (an in-progress assistant turn) — the route
        // rejects empty content, and they carry nothing to export.
        body: JSON.stringify({
          context,
          model,
          messages: messages.filter((m) => m.content.trim() !== ""),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const payload = await res.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-payload-${context}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-surface-raised p-3 text-sm">
      <section>
        <h3 className="mb-1 font-semibold text-foreground">{t("context")}</h3>
        <code className="rounded bg-surface-muted px-1.5 py-0.5 text-foreground">{context}</code>
      </section>

      <section>
        <h3 className="mb-1 font-semibold text-foreground">
          {t("tools", { count: tools.length })}
        </h3>
        {tools.length === 0 ? (
          <p className="text-foreground-muted">{t("noTools")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {tools.map((name) => (
              <li
                key={name}
                className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
              >
                {name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isPmSso && (
        <section className="flex flex-col gap-2 rounded-lg border border-border p-2">
          <h3 className="font-semibold text-foreground">{t("prompts.title")}</h3>
          <p className="text-xs text-foreground-muted">{t("prompts.help")}</p>
          <div className="flex items-center gap-2">
            <select
              value={selectedId}
              onChange={(e) => selectVersion(e.target.value)}
              aria-label={t("prompts.select")}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
            >
              <option value="">{t("prompts.default")}</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={startNew}
              className="shrink-0 rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted"
            >
              {t("prompts.new")}
            </button>
            <button
              type="button"
              onClick={deleteVersion}
              disabled={!selectedId || pvBusy}
              className="shrink-0 rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-danger hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("prompts.delete")}
            </button>
          </div>

          {override !== null && draft === null && (
            <p className="text-xs text-foreground-muted">{t("prompts.active")}</p>
          )}

          {draft !== null && (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder={t("prompts.labelPlaceholder")}
                aria-label={t("prompts.label")}
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
              />
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={8}
                aria-label={t("prompts.editor")}
                className="resize-y rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveVersion}
                  disabled={pvBusy || label.trim() === "" || draft.trim() === ""}
                  className="rounded-md border border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pvBusy ? t("prompts.saving") : t("prompts.save")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setPvError(null);
                  }}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted"
                >
                  {t("prompts.cancel")}
                </button>
              </div>
            </div>
          )}

          {pvError && (
            <p role="alert" className="text-xs text-danger">
              {t("prompts.error", { message: pvError })}
            </p>
          )}
        </section>
      )}

      {isPmSso && (
        <section>
          <button
            type="button"
            onClick={exportChat}
            disabled={exporting || messages.length === 0}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? t("exporting") : t("export")}
          </button>
          {exportError && (
            <p role="alert" className="mt-1 text-danger">
              {t("exportError", { message: exportError })}
            </p>
          )}
        </section>
      )}

      <section className="flex min-h-0 flex-1 flex-col">
        <h3 className="mb-1 font-semibold text-foreground">{t("prompt")}</h3>
        {loading && <p className="text-foreground-muted">{t("loading")}</p>}
        {error && (
          <p role="alert" className="text-danger">
            {t("error", { message: error })}
          </p>
        )}
        {!loading && !error && (
          <pre className="flex-1 whitespace-pre-wrap break-words rounded bg-surface-muted p-2 text-xs text-foreground">
            {prompt}
          </pre>
        )}
      </section>
    </div>
  );
}
