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

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { ChatEventParser, type ToolResult } from "@/lib/chat/client-sse";
import { buildModelHistory } from "@/lib/chat/build-history";
import { parseMarkdown, type Block, type Inline, type ListBlock } from "@/lib/chat/markdown";
import { toolSummary, blobView } from "@/lib/chat/tool-card";
import { isAtBottom } from "@/lib/chat/scroll-anchor";
import {
  getActivePageContext,
  subscribeActivePageContext,
} from "@/lib/chat/page-context";
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
 *
 * `getOverride` (optional, ai-widget-ux PM-SSO prompt editor) lets a surface send
 * a per-request `systemPromptOverride` (a selected prompt-version's text). Read
 * fresh per `send`. The route ignores it unless the caller is PM-SSO, so a
 * non-SSO surface sending it is harmless. Omit / return undefined → no override.
 *
 * `getInlineContext` (optional) returns a short text block prepended to the NEXT
 * message SENT TO THE MODEL (not shown in the user's transcript bubble) — e.g. the
 * Page Builder's currently-selected page. Read fresh per `send`, so each message
 * carries the context that's current at send-time. Omit / "" → nothing prepended.
 */
export function useChat(
  getContext?: () => string | undefined,
  getModel?: () => string | undefined,
  getOverride?: () => string | undefined,
  getInlineContext?: () => string | undefined,
) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (trimmed === "" || busy) return;

    setError(null);
    // Inline context (e.g. the Page Builder's selected page) is prepended to the
    // MODEL-facing message only; the user's transcript bubble shows their raw text.
    const inline = getInlineContext?.()?.trim();
    const modelContent = inline ? `${inline}\n\n${trimmed}` : trimmed;
    // Flatten the transcript into the {role,content} history the route accepts:
    // assistant turns that were pure tool calls (no text) carry their tool block
    // so content is never empty (route 400s otherwise) and the model sees prior
    // tool results instead of re-discovering. (See lib/chat/build-history.ts.)
    const history = buildModelHistory(messages, modelContent);
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
      const override = getOverride?.();
      const payload: Record<string, unknown> = { messages: history };
      if (context) payload.context = context;
      if (model) payload.model = model;
      if (override) payload.systemPromptOverride = override;
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
 * "Context attached" chip — visible when the assistant will append inline context
 * (e.g. the Page Builder's selected page) to the next message. Click to expand the
 * exact text being sent. Subscribes to the page-context store so it shows/hides as
 * the user navigates between pages. Renders nothing when no context is attached.
 */
function ContextChip() {
  const t = useTranslations("chat");
  const context = useSyncExternalStore(
    subscribeActivePageContext,
    getActivePageContext,
    () => "", // server snapshot: never attached during SSR
  );
  const [open, setOpen] = useState(false);
  if (!context) return null;
  return (
    <div className="rounded-md border border-border bg-surface-muted px-2 py-1 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        <span className="truncate">{t("contextAttached")}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          className={"ml-auto shrink-0 transition-transform " + (open ? "rotate-180" : "")}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <pre className="mt-1.5 whitespace-pre-wrap break-words border-t border-border pt-1.5 text-foreground-muted">
          {context}
        </pre>
      )}
    </div>
  );
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
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, busy, error, send } = chat;

  // Restore the Enter-behaviour pref on mount (client-only; localStorage).
  useEffect(() => {
    setEnterMode(loadEnterMode());
  }, []);

  // Follow new content only while the reader is parked at the bottom; if they've
  // scrolled up to re-read, leave them be and surface the "jump to latest" pill.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && isAtBottom(el)) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
      if (el) {
        el.scrollTop = el.scrollHeight;
        setAtBottom(true);
      }
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
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={(e) => setAtBottom(isAtBottom(e.currentTarget))}
          className={
            "flex min-h-0 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-surface-raised p-4 " +
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
        {!atBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface-raised px-3 py-1 text-foreground shadow-md hover:bg-surface-muted"
          >
            {t("scrollToLatest")} ↓
          </button>
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
        <ContextChip />
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

/**
 * Render assistant Markdown as safe React elements (never dangerouslySetInnerHTML).
 * Parsing is the pure, unit-tested `lib/chat/markdown.ts`; this only maps the
 * block/inline tree to elements styled with the bounded utility tokens. Links are
 * restricted to http(s) and open in a new tab with `noopener`.
 */
function Markdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-2">
      {parseMarkdown(source).map((block, i) => (
        <MarkdownBlock key={i} block={block} />
      ))}
    </div>
  );
}

function MarkdownBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const size =
        block.level <= 1 ? "text-lg" : block.level === 2 ? "text-base" : "text-sm";
      return <p className={`font-semibold ${size}`}><Inlines nodes={block.children} /></p>;
    }
    case "paragraph":
      return <p className="whitespace-pre-wrap"><Inlines nodes={block.children} /></p>;
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md bg-surface px-2 py-1 text-sm">
          <code>{block.value}</code>
        </pre>
      );
    case "list":
      return <MarkdownList list={block} />;
    case "blockquote":
      return (
        <blockquote className="border-l-2 border-border pl-3 text-foreground-muted italic">
          <Inlines nodes={block.children} />
        </blockquote>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i} className="border border-border px-2 py-1 text-left font-semibold">
                    <Inlines nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border border-border px-2 py-1">
                      <Inlines nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Recursive list renderer — an item's `sublist` nests another list inside its <li>. */
function MarkdownList({ list }: { list: ListBlock }) {
  const Tag = list.ordered ? "ol" : "ul";
  return (
    <Tag className="ml-5 flex flex-col gap-1" style={{ listStyleType: list.ordered ? "decimal" : "disc" }}>
      {list.items.map((item, i) => (
        <li key={i}>
          <Inlines nodes={item.children} />
          {item.sublist && <MarkdownList list={item.sublist} />}
        </li>
      ))}
    </Tag>
  );
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <InlineNode key={i} node={n} />
      ))}
    </>
  );
}

/** http(s)-only guard so a parsed `href` can never be a javascript:/data: URL. */
function safeHref(href: string): string | undefined {
  return /^https?:\/\//i.test(href) ? href : undefined;
}

function InlineNode({ node }: { node: Inline }) {
  switch (node.type) {
    case "text":
      return <>{node.value}</>;
    case "bold":
      return <strong className="font-semibold"><Inlines nodes={node.children} /></strong>;
    case "italic":
      return <em className="italic"><Inlines nodes={node.children} /></em>;
    case "code":
      return <code className="rounded-sm bg-surface px-1 text-sm">{node.value}</code>;
    case "link": {
      const href = safeHref(node.href);
      if (!href) return <Inlines nodes={node.children} />; // drop unsafe scheme, keep text
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:text-primary-hover"
        >
          <Inlines nodes={node.children} />
        </a>
      );
    }
  }
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
      <div className="rounded-lg bg-surface-muted px-3 py-2 text-foreground">
        {content ? (
          <Markdown source={content} />
        ) : (
          <span className="whitespace-pre-wrap">{thinking ? t("thinking") : ""}</span>
        )}
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
  const inputBlob = blobView(tool.input);
  const outputBlob = blobView(tool.output);
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
      {inputBlob.full && <ToolBlob label={t("tool.input")} blob={inputBlob} t={t} />}
      {outputBlob.full && <ToolBlob label={t("tool.output")} blob={outputBlob} t={t} />}
    </details>
  );
}

function ToolBlob({
  label,
  blob,
  t,
}: {
  label: string;
  blob: ReturnType<typeof blobView>;
  t: ReturnType<typeof useTranslations>;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = expanded ? blob.full : blob.preview;
  return (
    <div className="mt-2">
      <p className="mb-1 text-foreground-muted">{label}</p>
      <pre className="overflow-x-auto rounded-md bg-surface px-2 py-1 text-foreground">
        {text}
      </pre>
      {blob.truncated && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 rounded-sm text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? t("tool.showLess") : t("tool.showMore", { count: blob.hidden })}
        </button>
      )}
    </div>
  );
}
