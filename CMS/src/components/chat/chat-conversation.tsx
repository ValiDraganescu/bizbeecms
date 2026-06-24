"use client";

/**
 * Shared chat conversation core (Milestone 2, ai-assistant goal). The streaming
 * transport + transcript that BOTH the full-page `/admin/chat` UI and the
 * floating Intercom-style `ChatWidget` render. Extracted from the original
 * `admin-chat.tsx` so the two surfaces share ONE chat pipeline (the
 * `/api/chat` SSE route + `lib/chat/client-sse.ts` parser) — never a fork.
 *
 * `useChat` owns fetch/ReadableStream/state; the presentational bits (bubbles,
 * tool cards, form) are below. All copy via next-intl (EN/FI/ET); styling uses
 * purpose-token Tailwind utilities only.
 *
 * ponytail: one hand-rolled reader, no SSE client lib; frame parsing stays in
 * the pure unit-tested `lib/chat/client-sse.ts`.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChatEventParser, type ToolResult } from "@/lib/chat/client-sse";
import { toolSummary, formatBlob } from "@/lib/chat/tool-card";
import {
  decideSendOnEnter,
  loadEnterMode,
  saveEnterMode,
  type EnterMode,
} from "@/lib/chat/enter-mode";

export type ChatMsg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tools: ToolResult[] };

/**
 * Streaming chat state + a `send` action, shared by every chat surface.
 *
 * `getContext` (optional) lets a page-aware surface tell the route which admin
 * page it's on so the assistant scopes its tools + system prompt (Slice 2). It's
 * read fresh per `send` (a function, not a value) so navigating mid-conversation
 * picks up the new page. Omit it (the full-page /admin/chat) → route defaults to
 * "general" (the full toolset).
 *
 * `getModel` (optional, Slice 4) lets a surface tell the route which allowlisted
 * model to use (the picker). Read fresh per `send`. Omit it → route uses its
 * default. The id is validated server-side, so an unknown value is harmless.
 */
export function useChat(
  getContext?: () => string | undefined,
  getModel?: () => string | undefined,
) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (trimmed === "" || busy) return;

    setError(null);
    const history = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: trimmed },
    ];
    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
      { role: "assistant", content: "", tools: [] },
    ]);
    setBusy(true);

    const appendToken = (chunk: string) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, content: last.content + chunk };
        }
        return next;
      });
    const addTool = (result: ToolResult) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, tools: [...last.tools, result] };
        }
        return next;
      });

    try {
      const context = getContext?.();
      const model = getModel?.();
      const payload: Record<string, unknown> = { messages: history };
      if (context) payload.context = context;
      if (model) payload.model = model;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* non-JSON error body */
        }
        setError(msg);
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = new ChatEventParser();
      let streamError: string | null = null;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        const events = done
          ? parser.flush()
          : parser.push(decoder.decode(value, { stream: true }));
        for (const ev of events) {
          if (ev.type === "token") appendToken(ev.text);
          else if (ev.type === "tool") addTool(ev.result);
          else if (ev.type === "error") streamError = ev.message;
        }
        if (done) break;
      }
      if (streamError) setError(streamError);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // History (Slice 4 sub-slice 3): seed the transcript from a loaded thread, or
  // clear it for a new conversation. Tool cards now round-trip (ai-widget-ux):
  // a loaded assistant turn restores its stored `tools` so the cards (incl. the
  // input/output accordion) reappear; a turn that predates persistence has none.
  function seed(seedMessages: { role: string; content: string; tools?: unknown[] }[]) {
    setError(null);
    setMessages(
      seedMessages.map((m) =>
        m.role === "user"
          ? { role: "user", content: m.content }
          : {
              role: "assistant",
              content: m.content,
              tools: Array.isArray(m.tools) ? (m.tools as ToolResult[]) : [],
            },
      ),
    );
  }
  function reset() {
    setError(null);
    setMessages([]);
  }

  return { messages, busy, error, send, seed, reset };
}

/**
 * The transcript + input form. Layout-agnostic: the parent sizes the scroll
 * region via `transcriptClassName` (a `flex-1` container in the widget, a fixed
 * `height` on the page). `footer` lets the parent slot extra controls (the page
 * has none today; later slices add debug/model-picker).
 */
export function ChatConversation({
  chat,
  transcriptClassName,
  footer,
}: {
  chat: ReturnType<typeof useChat>;
  transcriptClassName?: string;
  footer?: ReactNode;
}) {
  const t = useTranslations("chat");
  const [input, setInput] = useState("");
  const [enterMode, setEnterMode] = useState<EnterMode>("send");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, busy, error, send } = chat;

  // Restore the Enter-behaviour pref on mount (client-only; localStorage).
  useEffect(() => {
    setEnterMode(loadEnterMode());
  }, []);

  const toggleEnterMode = () => {
    setEnterMode((m) => {
      const next: EnterMode = m === "send" ? "newline" : "send";
      saveEnterMode(next);
      return next;
    });
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  async function onSend() {
    const text = input.trim();
    if (text === "" || busy) return;
    setInput("");
    scrollToBottom();
    await send(text);
    scrollToBottom();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        ref={scrollRef}
        className={
          "flex flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-surface-raised p-4 " +
          (transcriptClassName ?? "")
        }
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="text-foreground-muted">{t("empty")}</p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <UserBubble key={i} content={m.content} label={t("you")} />
          ) : (
            <AssistantBubble
              key={i}
              content={m.content}
              tools={m.tools}
              label={t("assistant")}
              thinking={busy && i === messages.length - 1 && m.content === ""}
              t={t}
            />
          ),
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {t("error", { message: error })}
        </p>
      )}

      {footer}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
      >
        <textarea
          className="min-h-[5.5rem] max-h-64 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-foreground"
          rows={3}
          placeholder={t("placeholder")}
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (decideSendOnEnter(enterMode, { shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey })) {
              e.preventDefault();
              void onSend();
            }
          }}
          aria-label={t("placeholder")}
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleEnterMode}
            className="rounded-md border border-border px-2 py-1 text-foreground-muted hover:text-foreground"
            aria-label={t("enterMode.aria")}
            title={t("enterMode.aria")}
          >
            {enterMode === "send" ? t("enterMode.send") : t("enterMode.newline")}
          </button>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            disabled={busy || input.trim() === ""}
          >
            {busy ? t("sending") : t("send")}
          </button>
        </div>
      </form>
    </div>
  );
}

function UserBubble({ content, label }: { content: string; label: string }) {
  return (
    <div className="self-end max-w-[80%]">
      <p className="mb-1 text-foreground-muted">{label}</p>
      <div className="rounded-lg bg-primary-subtle px-3 py-2 text-foreground whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  tools,
  label,
  thinking,
  t,
}: {
  content: string;
  tools: ToolResult[];
  label: string;
  thinking: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="self-start max-w-[80%]">
      <p className="mb-1 text-foreground-muted">{label}</p>
      <div className="rounded-lg bg-surface-muted px-3 py-2 text-foreground whitespace-pre-wrap">
        {content || (thinking ? t("thinking") : "")}
      </div>
      {tools.map((tool, i) => (
        <ToolCard key={i} tool={tool} t={t} />
      ))}
    </div>
  );
}

function ToolCard({
  tool,
  t,
}: {
  tool: ToolResult;
  t: ReturnType<typeof useTranslations>;
}) {
  const summary = toolSummary(tool);
  const cls = tool.ok
    ? "border-success bg-success-subtle text-foreground"
    : "border-danger bg-danger-subtle text-foreground";
  const inputText = formatBlob(tool.input);
  const outputText = formatBlob(tool.output);
  // ponytail: native <details> is the accordion — collapsed by default, no JS state.
  return (
    <details className={`group mt-2 rounded-md border px-3 py-2 ${cls}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
        <span aria-hidden className="text-foreground-muted transition-transform group-open:rotate-90">
          ›
        </span>
        <span className="font-mono">{tool.name}</span>
        {summary && <span className="text-foreground-muted">{summary}</span>}
        {!tool.ok && <span className="text-danger">{t("tool.failBadge")}</span>}
      </summary>
      {!tool.ok && tool.errors && tool.errors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-danger">
          {tool.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {inputText && <ToolBlob label={t("tool.input")} text={inputText} />}
      {outputText && <ToolBlob label={t("tool.output")} text={outputText} />}
    </details>
  );
}

function ToolBlob({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-2">
      <p className="mb-1 text-foreground-muted">{label}</p>
      <pre className="overflow-x-auto rounded-md bg-surface px-2 py-1 text-foreground">
        {text}
      </pre>
    </div>
  );
}
