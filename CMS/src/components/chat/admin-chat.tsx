"use client";

/**
 * CMS admin chat UI (Milestone 2, B-track) — the in-browser front-end that
 * drives the `/api/chat` AI assistant. It POSTs the conversation, reads the
 * `text/event-stream` response, and renders:
 *   - the streaming assistant transcript (token events, appended live),
 *   - tool-result cards (create_component / create_page / translate outcomes).
 *
 * REST-only, client-managed conversation state (no server persistence — matches
 * the B1 design). All copy goes through next-intl (EN/FI/ET). Styling uses the
 * purpose-token Tailwind utilities from globals.css (bg-surface, text-foreground,
 * bg-primary, …) — never raw colors.
 *
 * ponytail: hand-rolled fetch + ReadableStream reader, no SSE client lib for a
 * handful of lines; the frame parsing lives in the pure, unit-tested
 * `lib/chat/client-sse.ts`.
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChatEventParser, type ToolResult } from "@/lib/chat/client-sse";

type Msg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tools: ToolResult[] };

export function AdminChat() {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  async function send() {
    const text = input.trim();
    if (text === "" || busy) return;

    setError(null);
    // Build the wire history (roles + content only) BEFORE we mutate state.
    const history = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: text },
    ];
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", tools: [] },
    ]);
    setInput("");
    setBusy(true);
    scrollToBottom();

    // Mutate the last (assistant) message as tokens/tools arrive.
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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
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
          if (ev.type === "token") {
            appendToken(ev.text);
            scrollToBottom();
          } else if (ev.type === "tool") {
            addTool(ev.result);
            scrollToBottom();
          } else if (ev.type === "error") {
            streamError = ev.message;
          }
          // "done" needs no action — the loop exits on stream end.
        }
        if (done) break;
      }
      if (streamError) setError(streamError);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      scrollToBottom();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={scrollRef}
        className="flex flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-surface-raised p-4"
        style={{ height: "60vh" }}
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

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-foreground"
          placeholder={t("placeholder")}
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          aria-label={t("placeholder")}
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          disabled={busy || input.trim() === ""}
        >
          {busy ? t("sending") : t("send")}
        </button>
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
  // A human label for the affected target (component name / page slug / target).
  const subject = tool.component ?? tool.page ?? tool.target ?? tool.name;
  const cls = tool.ok
    ? "border-success bg-success-subtle text-foreground"
    : "border-danger bg-danger-subtle text-foreground";
  return (
    <div className={`mt-2 rounded-md border px-3 py-2 ${cls}`}>
      <p className="font-medium">
        {tool.ok
          ? t("tool.ok", { name: tool.name, action: tool.action ?? "", subject })
          : t("tool.fail", { name: tool.name })}
      </p>
      {!tool.ok && tool.errors && tool.errors.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-danger">
          {tool.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
