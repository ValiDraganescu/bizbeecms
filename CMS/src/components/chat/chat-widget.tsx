"use client";

/**
 * Intercom-style floating AI-assistant widget (Milestone 2, ai-assistant goal,
 * Slice 1). A fixed bottom-right bubble that opens a compact chat panel over any
 * admin page. Mounted once in `SidebarShell`, so it's available everywhere in
 * the CMS admin.
 *
 * This is LAYOUT + transport only: it reuses the shared `ChatConversation` core
 * (the `/api/chat` SSE pipeline). Page-awareness (Slice 2), debug + model picker
 * (Slice 4) and history (Slice 4) come later — the panel header reserves room
 * for them. All copy via next-intl `chat.widget.*` (EN/FI/ET); purpose tokens
 * only.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChatConversation, useChat } from "@/components/chat/chat-conversation";
import { ChatDebugPanel } from "@/components/chat/chat-debug-panel";
import { detectAdminContext } from "@/lib/chat/tool-scopes";
import { getActivePageContext } from "@/lib/chat/page-context";
import { CHAT_MODELS, DEFAULT_MODEL, type CatalogModel } from "@/lib/chat/models";
import { coerceCatalog } from "@/lib/chat/catalog-coerce";
import { ModelPicker } from "@/components/chat/model-picker";
import { resolveInitialModel, loadModel, saveModel } from "@/lib/chat/selected-model";
import { formatUsd } from "@/lib/chat/credit";
import { nextUnread } from "@/lib/chat/unread-badge";
import { nextTabStop } from "@/lib/chat/focus-trap";
import {
  type PanelPreset,
  type PanelSize,
  resolveSize,
  nextPreset,
  isLarge,
  sizeFromDrag,
  loadPref,
  savePref,
} from "@/lib/chat/panel-size";

type ThreadSummary = { id: string; title: string; updatedAt: number };

// Remember which thread the widget is showing across a page reload (per-tab, so
// two tabs don't fight over one thread). sessionStorage is fine — it's just a
// pointer; the transcript itself lives server-side in chat_thread.
const THREAD_KEY = "bizbee.chat.threadId";

export function ChatWidget() {
  const t = useTranslations("chat.widget");
  const [open, setOpen] = useState(false);
  // Unread badge (ai-widget-ux): set when a reply finishes while the panel is
  // closed; cleared when the panel opens. See `lib/chat/unread-badge.ts`.
  const [unread, setUnread] = useState(false);
  const [debug, setDebug] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  // Persisted across reloads (ai-widget-ux): restored on mount from localStorage,
  // validated against the live catalog (a removed model can't stick), written
  // through on change. Until the catalog loads we trust a stored id (the chat
  // route validates the model server-side regardless).
  const [model, setModelState] = useState(DEFAULT_MODEL);
  // The live model catalog (ai-attachments): needed to know the SELECTED model's
  // input modalities so the attachment `+`/drop-zone gates correctly. Seeded with
  // the static fallback; replaced once /api/chat/models loads.
  const [catalog, setCatalog] = useState<ReadonlyArray<CatalogModel>>(CHAT_MODELS);
  const selectedModalities =
    catalog.find((m) => m.id === model)?.inputModalities ?? ["text"];
  function setModel(id: string) {
    setModelState(id);
    saveModel(id);
  }
  // PM-SSO system-prompt editor (ai-widget-ux): the selected version's prompt
  // text, threaded into the chat POST as a per-request `systemPromptOverride`
  // (session-only — never a site default; the route ignores it for non-SSO).
  // null = no override (assembled default). Set/cleared from the debug panel.
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  // The active version's label, shown inline near the input so the operator
  // always knows they're off the assembled default (not just in the debug panel).
  const [overrideLabel, setOverrideLabel] = useState<string | null>(null);
  function applyOverride(prompt: string | null, label: string | null) {
    setPromptOverride(prompt);
    setOverrideLabel(label);
  }
  // Resizable panel (ai-widget-ux): preset toggle (default ⇄ half-screen) plus
  // free-drag via native CSS `resize`. Size is resolved against the live
  // viewport so a panel sized big on one screen is clamped, never lost.
  const [panel, setPanel] = useState<PanelSize | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // In-use OpenRouter key credit (ai-openrouter): only set when the env/minted
  // key is in use; null (and the line is hidden) for CMS-local user keys or no key.
  const [credit, setCredit] = useState<{
    usage: number;
    limit: number | null;
    remaining: number | null;
  } | null>(null);
  const pathname = usePathname();
  // The conversation lives at the widget level so it SURVIVES minimize (closing
  // the panel just hides it; the transcript is intact when reopened).
  // Page-awareness (Slice 2): tell the route which admin page we're on, read
  // fresh per send so navigating mid-chat re-scopes the assistant's tools.
  // Model picker (Slice 4): the chosen model is also read fresh per send.
  const chat = useChat(
    () => detectAdminContext(pathname),
    () => model,
    () => promptOverride ?? undefined,
    () => getActivePageContext() || undefined,
  );

  // History (Slice 4 sub-slice 3): the current thread's server id (null = a new,
  // unsaved conversation). Saved after each completed turn so refresh/reopen
  // keeps the transcript. `busyRef` lets the save effect fire only on the
  // busy→idle EDGE (turn finished), not on every render.
  const threadId = useRef<string | null>(null);
  const busyRef = useRef(false);
  const { messages, busy } = chat;

  async function loadThreads() {
    try {
      const res = await fetch("/api/chat/history");
      if (!res.ok) return;
      const j = (await res.json()) as { threads?: ThreadSummary[] };
      setThreads(j.threads ?? []);
    } catch {
      /* offline / no binding — leave the list as-is */
    }
  }

  // On mount, resume the conversation a reload interrupted: prefer the per-tab
  // remembered thread id, else fall back to the most recent saved thread. Only
  // when the transcript is still empty and no thread is loaded — never clobber
  // an in-flight convo. Runs once.
  useEffect(() => {
    if (threadId.current !== null) return;
    let cancelled = false;
    void (async () => {
      let id: string | null = null;
      try {
        id = sessionStorage.getItem(THREAD_KEY);
      } catch {
        /* no storage */
      }
      if (!id) {
        try {
          const res = await fetch("/api/chat/history");
          if (res.ok) {
            const j = (await res.json()) as { threads?: ThreadSummary[] };
            id = j.threads?.[0]?.id ?? null;
          }
        } catch {
          /* offline / no binding */
        }
      }
      if (cancelled || !id || threadId.current !== null) return;
      await openThread(id);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save the transcript when a turn finishes (busy true→false with messages).
  useEffect(() => {
    const wasBusy = busyRef.current;
    busyRef.current = busy;
    if (!(wasBusy && !busy)) return; // only on the finish edge
    if (messages.length === 0) return;
    // A reply just landed; flag it unread if the panel is closed.
    setUnread((cur) => nextUnread(cur, { open, replyFinished: true }));
    const payload = {
      id: threadId.current,
      messages: messages.map((m) =>
        m.role === "assistant"
          ? { role: m.role, content: m.content, tools: m.tools }
          : { role: m.role, content: m.content },
      ),
    };
    void (async () => {
      try {
        const res = await fetch("/api/chat/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return;
        const j = (await res.json()) as { id?: string };
        if (j.id) {
          threadId.current = j.id;
          try {
            sessionStorage.setItem(THREAD_KEY, j.id);
          } catch {
            /* private mode / no storage — restore just won't survive reload */
          }
        }
        if (historyOpen) void loadThreads();
      } catch {
        /* best-effort persistence */
      }
    })();
  }, [busy, messages, historyOpen, open]);

  async function openThread(id: string) {
    try {
      const res = await fetch(`/api/chat/history?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const j = (await res.json()) as {
        thread?: { id: string; messages: { role: string; content: string; tools?: unknown[] }[] };
      };
      if (!j.thread) return;
      chat.seed(j.thread.messages);
      threadId.current = j.thread.id;
      try {
        sessionStorage.setItem(THREAD_KEY, j.thread.id);
      } catch {
        /* no storage */
      }
      setHistoryOpen(false);
    } catch {
      /* leave current transcript */
    }
  }

  async function removeThread(id: string) {
    try {
      await fetch(`/api/chat/history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    setThreads((prev) => prev.filter((th) => th.id !== id));
    if (threadId.current === id) {
      threadId.current = null;
      forgetThread();
      chat.reset();
    }
  }

  function forgetThread() {
    try {
      sessionStorage.removeItem(THREAD_KEY);
    } catch {
      /* no storage */
    }
  }

  function newConversation() {
    threadId.current = null;
    forgetThread();
    chat.reset();
    setHistoryOpen(false);
  }

  // Restore the persisted model once on mount, validated against the live
  // catalog so a model that's no longer offered falls back to the default.
  useEffect(() => {
    const stored = loadModel();
    if (!stored) return;
    let cancelled = false;
    void (async () => {
      let ids: string[] = [];
      try {
        const res = await fetch("/api/chat/models");
        if (res.ok) {
          const j = (await res.json()) as { models?: unknown };
          // Coerce the wire shape (a D1-cached payload from an older bundle may
          // lack fields like inputModalities) so the gate reads a safe catalog.
          const models = coerceCatalog(j.models);
          if (!cancelled && models.length > 0) setCatalog(models);
          ids = models.map((m) => m.id);
        }
      } catch {
        /* offline / no binding — empty ids → trust the stored id */
      }
      if (cancelled) return;
      setModelState(resolveInitialModel(stored, ids, DEFAULT_MODEL));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear the unread badge whenever the panel is open.
  useEffect(() => {
    if (open) setUnread(false);
  }, [open]);

  // On open, move focus INTO the panel (a11y): the message textarea if present,
  // else the panel container itself (it's `tabIndex={-1}`). A microtask defer
  // lets the panel mount first. Pairs with the Tab-trap keydown below so focus
  // can't escape the open dialog.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      const ta = el.querySelector<HTMLTextAreaElement>("textarea");
      (ta ?? el).focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Collect the panel's currently-focusable elements in DOM order (skip
  // disabled / aria-hidden / display:none). Recomputed per Tab so it tracks the
  // panel's mode (history / debug / conversation) without stale refs.
  function focusables(): HTMLElement[] {
    const el = panelRef.current;
    if (!el) return [];
    const sel = "button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])";
    return Array.from(el.querySelectorAll<HTMLElement>(sel)).filter(
      (n) => !n.hasAttribute("disabled") && n.getAttribute("aria-hidden") !== "true" && n.offsetParent !== null,
    );
  }

  // Load the in-use key's remaining credit when the panel opens (ai-openrouter).
  // Only the env/minted key reports credit; the route returns null otherwise.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/chat/credit");
        if (!res.ok) return;
        const j = (await res.json()) as {
          credit?: { usage: number; limit: number | null; remaining: number | null } | null;
        };
        if (!cancelled) setCredit(j.credit ?? null);
      } catch {
        /* offline / no binding — leave credit hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Resolve the stored size preference against the current viewport. Runs on
  // mount and whenever the window resizes so a clamped panel re-fits.
  useEffect(() => {
    function apply() {
      const pref = loadPref();
      const preset = pref?.preset ?? "default";
      const stored = pref && pref.width > 0 ? { width: pref.width, height: pref.height } : null;
      setPanel(resolveSize(preset, stored, window.innerWidth, window.innerHeight));
    }
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  function togglePreset() {
    setPanel((cur) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const large = cur ? isLarge(cur, vw, vh) : false;
      const preset: PanelPreset = nextPreset(cur?.preset ?? "default", large);
      const next = resolveSize(preset, null, vw, vh);
      savePref({ preset, width: next.width, height: next.height });
      return next;
    });
  }

  // Custom resize handle (ai-widget-ux): the native CSS `resize` grip sat at the
  // panel's BOTTOM-RIGHT, pinned to the viewport edge under the launcher — there
  // was no room to grab it. Since the panel is anchored bottom-right and grows
  // up/left, we put the handle at the TOP-LEFT corner and resize via pointer
  // events: drag left = wider, drag up = taller. Persisted as a "custom" size.
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const cur = panel ?? resolveSize("default", null, window.innerWidth, window.innerHeight);
    const start = { width: cur.width, height: cur.height };
    const startX = e.clientX;
    const startY = e.clientY;
    function onMove(ev: PointerEvent) {
      const next = sizeFromDrag(start, ev.clientX - startX, ev.clientY - startY, window.innerWidth, window.innerHeight);
      setPanel({ preset: "custom", width: next.width, height: next.height });
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const next = sizeFromDrag(start, ev.clientX - startX, ev.clientY - startY, window.innerWidth, window.innerHeight);
      savePref({ preset: "custom", width: next.width, height: next.height });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function toggleHistory() {
    setHistoryOpen((h) => {
      const next = !h;
      if (next) void loadThreads();
      return next;
    });
  }

  // Is the panel currently enlarged? Drives the expand/shrink button's icon +
  // pressed state. Keyed off actual size (not `preset`) so a free-dragged
  // "custom" size that's bigger than default still shows "shrink" — and the
  // toggle reliably returns to compact (fixes the one-way toggle bug).
  const panelLarge =
    panel != null && typeof window !== "undefined"
      ? isLarge(panel, window.innerWidth, window.innerHeight)
      : false;

  return (
    <>
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-24 right-6 z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          style={panel ? { width: panel.width, height: panel.height } : undefined}
          // Esc minimizes the panel — keyboard parity with the close button. Bound
          // on the dialog (focus lives inside it); ignore Esc while a textarea/input
          // is mid-composition so it doesn't fight IME/typing escape.
          // Tab/Shift+Tab is trapped so focus can't leak to the page behind the
          // open dialog (see `lib/chat/focus-trap.ts` for the wrap math).
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              return;
            }
            if (e.key === "Tab") {
              const items = focusables();
              if (items.length === 0) return;
              const current = items.indexOf(document.activeElement as HTMLElement);
              const next = nextTabStop(items.length, current, e.shiftKey);
              e.preventDefault();
              items[next]?.focus();
            }
          }}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          aria-label={t("title")}
        >
          {/* Top-left resize handle (ai-widget-ux): drag to resize up/left.
              `touch-none` so a touch-drag resizes instead of scrolling. */}
          <div
            role="separator"
            aria-label={t("resize")}
            title={t("resize")}
            onPointerDown={startResize}
            className="absolute left-0 top-0 z-10 flex h-5 w-5 cursor-nwse-resize touch-none items-start justify-start p-1 text-foreground-muted hover:text-foreground"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.4}>
              <path d="M9 1 1 9M5 1 1 5M9 5 5 9" />
            </svg>
          </div>
          <header className="flex items-center justify-between gap-2 border-b border-border bg-surface-raised px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{t("title")}</p>
              <p className="truncate text-xs text-foreground-muted">{t("subtitle")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={newConversation}
                aria-label={t("new")}
                title={t("new")}
                className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                type="button"
                onClick={toggleHistory}
                aria-label={t("history")}
                aria-pressed={historyOpen}
                title={t("history")}
                className={
                  "rounded-md p-1.5 transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (historyOpen ? "bg-surface-muted text-foreground" : "text-foreground-muted")
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setDebug((d) => !d)}
                aria-label={t("debug")}
                aria-pressed={debug}
                title={t("debug")}
                className={
                  "rounded-md p-1.5 transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (debug ? "bg-surface-muted text-foreground" : "text-foreground-muted")
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={togglePreset}
                aria-label={panelLarge ? t("sizeCompact") : t("sizeHalf")}
                aria-pressed={panelLarge}
                title={panelLarge ? t("sizeCompact") : t("sizeHalf")}
                className={
                  "rounded-md p-1.5 transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (panelLarge ? "bg-surface-muted text-foreground" : "text-foreground-muted")
                }
              >
                {panelLarge ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M14 10 21 3M21 3h-5M21 3v5M10 14l-7 7M3 21h5M3 21v-5" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M3 9V3h6M21 15v6h-6M21 9V3h-6M3 15v6h6" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("minimize")}
                className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            {historyOpen ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" aria-label={t("history")}>
                {threads.length === 0 ? (
                  <p className="text-sm text-foreground-muted">{t("historyEmpty")}</p>
                ) : (
                  threads.map((th) => (
                    <div
                      key={th.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => void openThread(th.id)}
                        className="min-w-0 flex-1 truncate text-left text-sm text-foreground hover:text-primary"
                        title={th.title}
                      >
                        {th.title || t("historyUntitled")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeThread(th.id)}
                        aria-label={t("historyDelete")}
                        title={t("historyDelete")}
                        className="shrink-0 rounded p-1 text-foreground-muted transition-colors hover:bg-danger-subtle hover:text-danger"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : debug ? (
              <ChatDebugPanel
                messages={messages}
                model={model}
                override={promptOverride}
                onOverrideChange={applyOverride}
              />
            ) : (
              <ChatConversation
                chat={chat}
                transcriptClassName="flex-1"
                inputModalities={selectedModalities}
                footer={
                  <div className="flex flex-col gap-1 text-xs text-foreground-muted">
                    {promptOverride !== null && (
                      <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-subtle px-2 py-1 text-warning">
                        <span className="min-w-0 flex-1 truncate" title={t("overrideTitle")}>
                          {overrideLabel
                            ? t("overrideActive", { label: overrideLabel })
                            : t("overrideActiveUnnamed")}
                        </span>
                        <button
                          type="button"
                          onClick={() => applyOverride(null, null)}
                          className="shrink-0 rounded font-medium underline hover:no-underline"
                        >
                          {t("overrideClear")}
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">{t("model")}</span>
                      <ModelPicker value={model} onChange={setModel} />
                    </div>
                    {credit && (
                      <span className="shrink-0 tabular-nums" title={t("creditTitle")}>
                        {credit.limit != null && credit.remaining != null
                          ? t("creditOf", {
                              remaining: formatUsd(credit.remaining),
                              limit: formatUsd(credit.limit),
                            })
                          : t("creditUsage", { usage: formatUsd(credit.usage) })}
                      </span>
                    )}
                  </div>
                }
              />
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? t("close") : t("open")}
        title={open ? t("close") : t("open")}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {unread && !open && (
          <span
            role="status"
            aria-label={t("unread")}
            title={t("unread")}
            className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-surface bg-danger"
          />
        )}
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </>
  );
}
