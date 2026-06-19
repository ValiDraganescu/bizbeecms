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

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChatConversation, useChat } from "@/components/chat/chat-conversation";
import { ChatDebugPanel } from "@/components/chat/chat-debug-panel";
import { detectAdminContext } from "@/lib/chat/tool-scopes";
import { CHAT_MODELS, DEFAULT_MODEL } from "@/lib/chat/models";

export function ChatWidget() {
  const t = useTranslations("chat.widget");
  const [open, setOpen] = useState(false);
  const [debug, setDebug] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
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

  return (
    <>
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex h-[min(70vh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
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
            {debug ? (
              <ChatDebugPanel />
            ) : (
              <ChatConversation
                chat={chat}
                transcriptClassName="flex-1"
                footer={
                  <label className="flex items-center gap-2 text-xs text-foreground-muted">
                    <span className="shrink-0">{t("model")}</span>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      aria-label={t("model")}
                      className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-foreground"
                    >
                      {CHAT_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
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
