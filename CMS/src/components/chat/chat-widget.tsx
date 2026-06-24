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
import { DEFAULT_MODEL } from "@/lib/chat/models";
import { ModelPicker } from "@/components/chat/model-picker";
import {
  type PanelPreset,
  type PanelSize,
  resolveSize,
  nextPreset,
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
  const [debug, setDebug] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [model, setModel] = useState(DEFAULT_MODEL);
  // Resizable panel (ai-widget-ux): preset toggle (default ⇄ half-screen) plus
  // free-drag via native CSS `resize`. Size is resolved against the live
  // viewport so a panel sized big on one screen is clamped, never lost.
  const [panel, setPanel] = useState<PanelSize | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  // The conversation lives at the widget level so it SURVIVES minimize (closing
  // the panel just hides it; the transcript is intact when reopened).
  // Page-awareness (Slice 2): tell the route which admin page we're on, read
  // fresh per send so navigating mid-chat re-scopes the assistant's tools.
  // Model picker (Slice 4): the chosen model is also read fresh per send.
  const chat = useChat(
    () => detectAdminContext(pathname),
    () => model,
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
    const payload = {
      id: threadId.current,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
  }, [busy, messages, historyOpen]);

  async function openThread(id: string) {
    try {
      const res = await fetch(`/api/chat/history?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const j = (await res.json()) as { thread?: { id: string; messages: { role: string; content: string }[] } };
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
      const preset: PanelPreset = nextPreset(cur?.preset ?? "default");
      const next = resolveSize(preset, null, window.innerWidth, window.innerHeight);
      savePref({ preset, width: next.width, height: next.height });
      return next;
    });
  }

  // Capture a free-drag (native CSS resize) as a "custom" px size to persist.
  function captureDrag() {
    const el = panelRef.current;
    if (!el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    setPanel({ preset: "custom", width, height });
    savePref({ preset: "custom", width, height });
  }

  function toggleHistory() {
    setHistoryOpen((h) => {
      const next = !h;
      if (next) void loadThreads();
      return next;
    });
  }

  return (
    <>
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-24 right-6 z-50 flex resize flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          style={panel ? { width: panel.width, height: panel.height } : undefined}
          onMouseUp={captureDrag}
          role="dialog"
          aria-label={t("title")}
        >
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
                className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
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
                  "rounded-md p-1.5 transition-colors hover:bg-surface-muted hover:text-foreground " +
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
                  "rounded-md p-1.5 transition-colors hover:bg-surface-muted hover:text-foreground " +
                  (debug ? "bg-surface-muted text-foreground" : "text-foreground-muted")
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 5V3M12 21v-2M5 12H3M21 12h-2M7 7 5.5 5.5M18.5 18.5 17 17M17 7l1.5-1.5M5.5 18.5 7 17" />
                </svg>
              </button>
              <button
                type="button"
                onClick={togglePreset}
                aria-label={panel?.preset === "half" ? t("sizeCompact") : t("sizeHalf")}
                aria-pressed={panel?.preset === "half"}
                title={panel?.preset === "half" ? t("sizeCompact") : t("sizeHalf")}
                className={
                  "rounded-md p-1.5 transition-colors hover:bg-surface-muted hover:text-foreground " +
                  (panel?.preset === "half" ? "bg-surface-muted text-foreground" : "text-foreground-muted")
                }
              >
                {panel?.preset === "half" ? (
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
                className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
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
              <ChatDebugPanel />
            ) : (
              <ChatConversation
                chat={chat}
                transcriptClassName="flex-1"
                footer={
                  <div className="flex items-center gap-2 text-xs text-foreground-muted">
                    <span className="shrink-0">{t("model")}</span>
                    <ModelPicker value={model} onChange={setModel} />
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
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
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
