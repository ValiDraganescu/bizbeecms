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
import { mutatesRenderedPage, signalPageMutation } from "@/lib/chat/page-mutation-signal";
import { buildModelHistory } from "@/lib/chat/build-history";
import { parseMarkdown, type Block, type Inline, type ListBlock } from "@/lib/chat/markdown";
import { toolSummary, blobView } from "@/lib/chat/tool-card";
import { isAtBottom } from "@/lib/chat/scroll-anchor";
import {
  getActivePageContext,
  subscribeActivePageContext,
  getActiveSections,
} from "@/lib/chat/page-context";
import {
  findActiveMention,
  filterSections,
  applyMention,
  segmentMentions,
  type MentionSection,
} from "@/lib/chat/mention";
import {
  getActiveComponentContext,
  subscribeActiveComponentContext,
} from "@/lib/chat/component-context";
import {
  getActiveCollectionContext,
  subscribeActiveCollectionContext,
} from "@/lib/chat/collection-context";
import {
  getActiveDataSourcesContext,
  subscribeActiveDataSourcesContext,
} from "@/lib/chat/data-sources-context";
import {
  decideSendOnEnter,
  loadEnterMode,
  saveEnterMode,
  type EnterMode,
} from "@/lib/chat/enter-mode";
import {
  acceptsFile,
  mimeToModality,
  buildUserContent,
  buildReferencedAssetsText,
  type Modality,
  type InlineAttachment,
  type ReferencedAsset,
} from "@/lib/chat/attachments";
import { MAX_ASSET_SIZE } from "@/lib/render/asset";
import { GalleryPicker, type GalleryAsset } from "@/components/media/gallery-picker";
import { subscribeChatAttachments } from "@/lib/chat/chat-attach-bus";

/**
 * One ordered piece of an assistant turn, for DISPLAY only. The stream
 * interleaves text and tool calls; `parts` preserves that order so tool cards
 * render exactly where the model emitted them (not piled after all the text).
 * `content`/`tools` stay the flat source of truth for model-history + persistence
 * (which don't care about interleaving) — `parts` is derived alongside them.
 */
export type AssistantPart =
  | { kind: "text"; text: string }
  | { kind: "tool"; result: ToolResult };

/** A media item shown inline in a user bubble (read attachment or referenced URL). */
export type BubbleMedia = { name: string; url: string; mime?: string };

export type ChatMsg =
  | { role: "user"; content: string; media?: BubbleMedia[] }
  | { role: "assistant"; content: string; tools: ToolResult[]; parts?: AssistantPart[] };

/** Base64-encode a Blob's bytes (browser). Used to inline R2 attachments. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** A url whose extension or mime says it's a renderable image. */
function isImageMedia(m: { url: string; mime?: string }): boolean {
  return (m.mime?.startsWith("image/") ?? false) || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(m.url);
}

/**
 * The text shown in the user's transcript bubble. Image media render inline as
 * thumbnails (see `media` on the message), so only NON-image attachments keep a
 * filename line here — that way a files-only image turn isn't an empty bubble
 * AND an image turn isn't both a thumbnail and a redundant `📎 name` line.
 */
function bubbleText(
  text: string,
  attachments: ReadonlyArray<BubbleMedia>,
  references: ReadonlyArray<BubbleMedia> = [],
): string {
  const lines = [
    ...attachments.filter((a) => !isImageMedia(a)).map((a) => `📎 ${a.name}`), // read
    ...references.filter((a) => !isImageMedia(a)).map((a) => `🔗 ${a.name}`), // reference (use URL)
  ];
  if (lines.length === 0) return text;
  const names = lines.join("\n");
  return text === "" ? names : `${text}\n\n${names}`;
}

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
 * Page Builder's currently-selected page, plus the resolved contents of any
 * `@section` the message mentions. Receives the user's trimmed message text so it
 * can resolve those mentions. Read fresh per `send`. Omit / "" → nothing prepended.
 */
export function useChat(
  getContext?: () => string | undefined,
  getModel?: () => string | undefined,
  getOverride?: () => string | undefined,
  getInlineContext?: (message: string) => string | undefined,
) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Latest token usage from the stream's final usage chunk. `promptTokens` is the
  // full conversation-context size, so it drives the context-usage meter. Null
  // until the first turn reports usage. ponytail: keep the latest, not a history.
  const [usage, setUsage] = useState<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null>(null);
  // The in-flight request's aborter, so `stop()` can cancel mid-stream.
  const abortRef = useRef<AbortController | null>(null);
  // The last send's args, so a failed turn can be re-sent verbatim (the error
  // row's "Retry"). Captured at the top of every send; null until the first.
  const lastSendRef = useRef<{
    text: string;
    attachments: PendingAttachment[];
    references: ReferencedAsset[];
  } | null>(null);

  function stop() {
    abortRef.current?.abort();
  }

  async function send(
    text: string,
    attachments: PendingAttachment[] = [],
    references: ReferencedAsset[] = [],
  ) {
    const trimmed = text.trim();
    if ((trimmed === "" && attachments.length === 0 && references.length === 0) || busy) return;

    // Remember this turn's exact inputs so the error row's "Retry" can re-send it.
    lastSendRef.current = { text, attachments, references };
    setError(null);
    // Inline context (e.g. the Page Builder's selected page) is prepended to the
    // MODEL-facing message only; the user's transcript bubble shows their raw text.
    // Referenced gallery assets (use-by-URL, NOT read) are appended as a text
    // block so the model gets their exact /media URLs without inlining bytes.
    const inline = getInlineContext?.(trimmed)?.trim();
    const refBlock = buildReferencedAssetsText(references);
    const modelText = [inline, trimmed, refBlock].filter((s) => s && s !== "").join("\n\n");

    // Read each pending attachment's bytes from R2 (the /media/<key> url the
    // uploader returned) and base64-encode them, then build the OpenRouter content
    // ARRAY (text + one inline part per file). A fetch failure drops that file
    // rather than aborting the send (its chip already went on the transcript text).
    let inlineFiles: InlineAttachment[] = [];
    if (attachments.length > 0) {
      setBusy(true);
      inlineFiles = (
        await Promise.all(
          attachments.map(async (a): Promise<InlineAttachment | null> => {
            try {
              const r = await fetch(a.url);
              if (!r.ok) return null;
              const base64 = await blobToBase64(await r.blob());
              return { mime: a.mime, base64, name: a.name };
            } catch {
              return null;
            }
          }),
        )
      ).filter((x): x is InlineAttachment => x !== null);
    }
    const modelContent = buildUserContent(modelText, inlineFiles);

    // Flatten the transcript into the {role,content} history the route accepts:
    // assistant turns that were pure tool calls (no text) carry their tool block
    // so content is never empty (route 400s otherwise) and the model sees prior
    // tool results instead of re-discovering. (See lib/chat/build-history.ts.)
    const history = buildModelHistory(messages, modelContent);
    // Image attachments/references render inline in the user bubble; collect them
    // (with url + mime) so the bubble can show thumbnails, not just filenames.
    const media: BubbleMedia[] = [
      ...attachments.map((a) => ({ name: a.name, url: a.url, mime: a.mime })),
      ...references.map((r) => ({ name: r.name, url: r.url })),
    ].filter(isImageMedia);
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: bubbleText(trimmed, attachments, references),
        ...(media.length > 0 ? { media } : {}),
      },
      { role: "assistant", content: "", tools: [], parts: [] },
    ]);
    setBusy(true);

    // Tokens append to the trailing text part (creating one if the last part is a
    // tool); tools push a new tool part. `parts` thus mirrors the stream's true
    // order. `content`/`tools` stay the flat source of truth in parallel.
    const appendToken = (chunk: string) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          const parts = [...(last.parts ?? [])];
          const tail = parts[parts.length - 1];
          if (tail && tail.kind === "text") {
            parts[parts.length - 1] = { kind: "text", text: tail.text + chunk };
          } else {
            parts.push({ kind: "text", text: chunk });
          }
          next[next.length - 1] = { ...last, content: last.content + chunk, parts };
        }
        return next;
      });
    const addTool = (result: ToolResult) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = {
            ...last,
            tools: [...last.tools, result],
            parts: [...(last.parts ?? []), { kind: "tool", result }],
          };
        }
        return next;
      });

    const controller = new AbortController();
    abortRef.current = controller;
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
        signal: controller.signal,
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
        // Nothing streamed — drop the empty assistant placeholder so the error
        // row stands alone (and Retry won't pile up blank bubbles).
        setMessages((prev) =>
          prev.length > 0 && prev[prev.length - 1].role === "assistant" && prev[prev.length - 1].content === ""
            ? prev.slice(0, -1)
            : prev,
        );
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
          else if (ev.type === "tool") {
            addTool(ev.result);
            // A page/component/theme write means the builder canvas is now stale —
            // signal it to refetch (cross-sibling, via a window event).
            if (mutatesRenderedPage(ev.result.name, ev.result.ok)) {
              signalPageMutation(ev.result.name);
            }
          } else if (ev.type === "usage") {
            setUsage({
              promptTokens: ev.promptTokens,
              completionTokens: ev.completionTokens,
              totalTokens: ev.totalTokens,
            });
          } else if (ev.type === "error") streamError = ev.message;
        }
        if (done) break;
      }
      if (streamError) setError(streamError);
    } catch (err) {
      // A user-initiated stop() aborts the fetch — that's not an error.
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  // History (Slice 4 sub-slice 3): seed the transcript from a loaded thread, or
  // clear it for a new conversation. Tool cards now round-trip (ai-widget-ux):
  // a loaded assistant turn restores its stored `tools` so the cards (incl. the
  // input/output accordion) reappear; a turn that predates persistence has none.
  function seed(
    seedMessages: { role: string; content: string; tools?: unknown[]; parts?: unknown[]; media?: unknown[] }[],
  ) {
    setError(null);
    setMessages(
      seedMessages.map((m) => {
        if (m.role === "user") {
          const media = Array.isArray(m.media) ? (m.media as BubbleMedia[]) : undefined;
          return { role: "user", content: m.content, ...(media && media.length > 0 ? { media } : {}) };
        }
        const tools = Array.isArray(m.tools) ? (m.tools as ToolResult[]) : [];
        // Prefer stored interleaved order; older threads (no `parts`) fall back to
        // text-then-tools, which is what they always displayed anyway.
        const parts = Array.isArray(m.parts)
          ? (m.parts as AssistantPart[])
          : [
              ...(m.content ? [{ kind: "text", text: m.content } as AssistantPart] : []),
              ...tools.map((result) => ({ kind: "tool", result }) as AssistantPart),
            ];
        return { role: "assistant", content: m.content, tools, parts };
      }),
    );
  }
  function reset() {
    setError(null);
    setMessages([]);
    setUsage(null);
    lastSendRef.current = null;
  }

  // Re-send the last turn after a failure (the error row's "Retry"). No-op if
  // nothing was ever sent or a turn is already in flight.
  function retry() {
    const last = lastSendRef.current;
    if (!last || busy) return;
    void send(last.text, last.attachments, last.references);
  }

  return { messages, busy, error, send, seed, reset, stop, retry, usage };
}

/**
 * "Context attached" chip — visible when the assistant will append inline context
 * (e.g. the Page Builder's selected page) to the next message. Click to expand the
 * exact text being sent. Subscribes to the page-context store so it shows/hides as
 * the user navigates between pages. Renders nothing when no context is attached.
 */
function ContextChip() {
  const t = useTranslations("chat");
  // Reflects BOTH inline-context stores (Page Builder + Develop workbench) so the
  // chip shows on either page. Snapshot is a plain string → useSyncExternalStore's
  // referential check is just string equality, no memo needed.
  const context = useSyncExternalStore(
    (fn) => {
      const a = subscribeActivePageContext(fn);
      const b = subscribeActiveComponentContext(fn);
      const c = subscribeActiveCollectionContext(fn);
      const d = subscribeActiveDataSourcesContext(fn);
      return () => {
        a();
        b();
        c();
        d();
      };
    },
    () =>
      [
        getActivePageContext(),
        getActiveComponentContext(),
        getActiveCollectionContext(),
        getActiveDataSourcesContext(),
      ]
        .filter((s) => s !== "")
        .join("\n\n"),
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
        <pre className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap break-words border-t border-border pt-1.5 text-foreground-muted">
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
/** A file attached to the pending message: uploaded to R2, awaiting send. */
export type PendingAttachment = {
  key: string;
  url: string;
  name: string;
  mime: string;
};

export function ChatConversation({
  chat,
  transcriptClassName,
  footer,
  inputModalities,
}: {
  chat: ReturnType<typeof useChat>;
  transcriptClassName?: string;
  footer?: ReactNode;
  /**
   * The SELECTED model's input modalities (ai-attachments). When it includes a
   * non-text modality the `+`/drop-zone is enabled and gates each file via
   * `acceptsFile`. Omitted / text-only → attachments disabled (a hint explains).
   */
  inputModalities?: string[];
}) {
  const t = useTranslations("chat");
  const [input, setInput] = useState("");
  const [enterMode, setEnterMode] = useState<EnterMode>("send");
  const [atBottom, setAtBottom] = useState(true);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  // Gallery assets attached to USE BY URL (dropped into components/pages), not read.
  const [references, setReferences] = useState<ReferencedAsset[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  // The `+` menu (open) and which gallery picker is showing ("read" | "reference" | null).
  const [menuOpen, setMenuOpen] = useState(false);
  const [gallery, setGallery] = useState<null | "read" | "reference">(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Highlight overlay mirroring the textarea (renders `@section` tokens as code
  // pills); kept scroll-aligned with the textarea so the pills sit under the text.
  const overlayRef = useRef<HTMLDivElement>(null);
  const { messages, busy, error, send, stop, retry } = chat;

  // Does the current text contain any `@mention` token? Only then do we paint the
  // overlay + make the textarea text transparent (otherwise it's a plain box).
  const hasMention = /`@[^`]+`/.test(input);

  function syncOverlayScroll() {
    const ta = textareaRef.current;
    const ov = overlayRef.current;
    if (ta && ov) {
      ov.scrollTop = ta.scrollTop;
      ov.scrollLeft = ta.scrollLeft;
    }
  }

  // @section mentions: the active page's sections (page-aware, empty off-page) +
  // the open `@query` token at the caret + the highlighted suggestion. The model
  // already gets the section list via page-context, so an inserted `@Name`
  // resolves server-side; this is the discoverable composer affordance.
  const sections = useSyncExternalStore<MentionSection[]>(
    subscribeActivePageContext,
    getActiveSections,
    () => [], // server snapshot: none during SSR
  );
  const [mentionCaret, setMentionCaret] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const activeMention =
    mentionCaret !== null ? findActiveMention(input, mentionCaret) : null;
  const mentionMatches =
    activeMention && sections.length > 0 ? filterSections(sections, activeMention.query) : [];
  const mentionOpen = activeMention !== null && mentionMatches.length > 0;

  // Insert the chosen section as `@Name ` over the active `@query`, then restore
  // focus + caret just after the inserted token.
  function insertMention(name: string) {
    if (!activeMention || mentionCaret === null) return;
    const next = applyMention(input, mentionCaret, activeMention, name);
    setInput(next.text);
    setMentionCaret(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      }
    });
  }

  // The model accepts non-text input → attachments are offered. Empty/undefined
  // modalities mean text-only (the catalog default), so the affordance is off.
  const mods = inputModalities ?? [];
  const canAttach = mods.some((m) => m !== "text");

  // Localized label for a MIME's modality, for the rejection message.
  function kindLabel(mime: string): string {
    const m: Modality = mimeToModality(mime);
    return t(
      m === "image"
        ? "attach.kindImage"
        : m === "audio"
          ? "attach.kindAudio"
          : m === "video"
            ? "attach.kindVideo"
            : "attach.kindFile",
    );
  }

  // Upload one accepted file via the EXISTING /api/assets route (reused, not
  // forked) and add a removable chip. Gating + size are checked before upload.
  async function addFiles(files: FileList | File[]) {
    setAttachError(null);
    const list = Array.from(files);
    for (const file of list) {
      if (!canAttach) {
        setAttachError(t("attach.textOnly"));
        return;
      }
      if (!acceptsFile(mods, file.type)) {
        setAttachError(t("attach.rejected", { name: file.name, kind: kindLabel(file.type) }));
        continue;
      }
      if (file.size > MAX_ASSET_SIZE) {
        setAttachError(t("attach.tooLarge", { name: file.name, max: MAX_ASSET_SIZE / 1024 / 1024 }));
        continue;
      }
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/assets", { method: "POST", body: form });
        if (!res.ok) {
          setAttachError(t("attach.uploadFailed", { name: file.name }));
          continue;
        }
        const row = (await res.json()) as { key: string; url: string };
        setAttachments((cur) => [
          ...cur,
          { key: row.key, url: row.url, name: file.name, mime: file.type },
        ]);
      } catch {
        setAttachError(t("attach.uploadFailed", { name: file.name }));
      } finally {
        setUploading(false);
      }
    }
  }

  function removeAttachment(key: string) {
    setAttachments((cur) => cur.filter((a) => a.key !== key));
  }

  function removeReference(url: string) {
    setReferences((cur) => cur.filter((r) => r.url !== url));
  }

  // "Read from gallery": the chosen gallery assets are already in R2 — turn each
  // into a read PendingAttachment (gated by the model's modalities, like a disk
  // upload). De-dupe against what's already attached.
  function addGalleryToRead(picked: GalleryAsset[]) {
    setGallery(null);
    setAttachError(null);
    for (const a of picked) {
      const mime = a.contentType ?? "";
      if (!canAttach) {
        setAttachError(t("attach.textOnly"));
        return;
      }
      if (!acceptsFile(mods, mime)) {
        setAttachError(t("attach.rejected", { name: a.filename, kind: kindLabel(mime) }));
        continue;
      }
      setAttachments((cur) =>
        cur.some((x) => x.key === a.key)
          ? cur
          : [...cur, { key: a.key, url: a.url, name: a.filename, mime }],
      );
    }
  }

  // "Insert media URL from gallery": store the chosen assets to REFERENCE by URL
  // (no inlining, no modality gate — works on any model). De-dupe by url.
  function addGalleryToReference(picked: GalleryAsset[]) {
    setGallery(null);
    setReferences((cur) => {
      const have = new Set(cur.map((r) => r.url));
      const add = picked
        .filter((a) => !have.has(a.url))
        .map((a) => ({ url: a.url, name: a.filename }));
      return [...cur, ...add];
    });
  }

  // Close the `+` menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  // Restore the Enter-behaviour pref on mount (client-only; localStorage).
  useEffect(() => {
    setEnterMode(loadEnterMode());
  }, []);

  // The Develop workbench's "Send preview to AI" captures the component at each
  // viewport and pushes the PNGs here. Add them as pending image attachments and
  // prefill the caption so the operator just hits Send (the vision model then
  // sees how the component looks across screen sizes). data: URLs fetch fine in
  // onSend's bytes-read step, so they need no R2 upload.
  useEffect(() => {
    return subscribeChatAttachments(({ images, caption }) => {
      if (images.length === 0) return;
      // The model must be able to read images, or the screenshots are useless.
      if (!mods.includes("image")) {
        setAttachError(t("attach.textOnly"));
        return;
      }
      setAttachments((cur) => [
        ...cur,
        ...images.map((img, i) => ({
          key: `preview-${i}-${img.name}`,
          url: img.dataUrl,
          name: img.name,
          mime: img.mime,
        })),
      ]);
      if (caption) setInput((cur) => (cur.trim() === "" ? caption : cur));
      setAttachError(null);
    });
    // mods is derived from inputModalities; re-subscribe if the selected model changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mods.join(",")]);

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
    if ((text === "" && attachments.length === 0 && references.length === 0) || busy || uploading)
      return;
    const pending = attachments;
    const refs = references;
    setInput("");
    setMentionCaret(null);
    setAttachments([]);
    setReferences([]);
    setAttachError(null);
    scrollToBottom();
    // Read attachments go inline (base64 data-URIs) to the model; referenced
    // gallery assets go as a /media-URL text block (use-by-URL, not read).
    await send(text, pending, refs);
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
              <UserBubble key={i} content={m.content} media={m.media} label={t("you")} />
            ) : (
              <AssistantBubble
                key={i}
                content={m.content}
                tools={m.tools}
                parts={m.parts}
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
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          <span className="min-w-0 flex-1">{t("error", { message: error })}</span>
          <button
            type="button"
            onClick={retry}
            disabled={busy}
            className="shrink-0 rounded font-medium underline hover:no-underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("retry")}
          </button>
        </div>
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

        {attachError && (
          <p role="alert" className="text-xs text-danger">
            {attachError}
          </p>
        )}

        {attachments.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              // Square thumbnail: image attachments show the actual image; the
              // remove button overlays the top-right corner. Non-image files (e.g.
              // pdf) fall back to a filename label inside the same square.
              <li
                key={a.key}
                className="group relative h-16 w-16 overflow-hidden rounded-md border border-border bg-surface-muted"
                title={a.name}
              >
                {a.mime.startsWith("image/") ? (
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-foreground-muted">
                    <span className="line-clamp-3 break-all">{a.name}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(a.key)}
                  aria-label={t("attach.remove")}
                  title={t("attach.remove")}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface/90 text-foreground-muted shadow-sm hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {references.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {references.map((r) => {
              // Gallery picks via "Insert URL" land here as references (url+name).
              // Image URLs (the /media/... assets) render as a square thumbnail;
              // a non-image reference URL keeps the link chip.
              const isImage = /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(r.url);
              if (isImage) {
                return (
                  <li
                    key={r.url}
                    className="group relative h-16 w-16 overflow-hidden rounded-md border border-primary"
                    title={r.name}
                  >
                    <img src={r.url} alt={r.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeReference(r.url)}
                      aria-label={t("attach.remove")}
                      title={t("attach.remove")}
                      className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface/90 text-foreground-muted shadow-sm hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="18" y1="6" x2="6" y2="18" />
                      </svg>
                    </button>
                  </li>
                );
              }
              return (
                <li
                  key={r.url}
                  className="flex max-w-[16rem] items-center gap-1.5 rounded-md border border-primary bg-primary-subtle px-2 py-1 text-xs text-foreground"
                  title={t("attach.referenceHint", { url: r.url })}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="shrink-0">
                    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span className="truncate" title={r.name}>{r.name}</span>
                  <button
                    type="button"
                    onClick={() => removeReference(r.url)}
                    aria-label={t("attach.remove")}
                    title={t("attach.remove")}
                    className="shrink-0 text-foreground-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="18" y1="6" x2="6" y2="18" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="relative rounded-md bg-surface">
          {/* @section autocomplete: anchored above the composer, listing the
              active page's sections that match the open `@query`. */}
          {mentionOpen && (
            <ul
              role="listbox"
              aria-label={t("mention.label")}
              className="absolute bottom-full left-0 z-50 mb-1 max-h-48 w-64 overflow-y-auto rounded-md border border-border bg-surface-raised py-1 shadow-lg"
            >
              {mentionMatches.map((s, idx) => {
                const active = idx === Math.min(mentionIndex, mentionMatches.length - 1);
                return (
                  <li key={s.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      // onMouseDown (not onClick) so the textarea doesn't blur
                      // and close the dropdown before the insert runs.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(s.name);
                      }}
                      onMouseEnter={() => setMentionIndex(idx)}
                      className={
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm " +
                        (active ? "bg-surface-muted text-foreground" : "text-foreground hover:bg-surface-muted")
                      }
                    >
                      <span className="text-foreground-muted">@</span>
                      <span className="truncate">{s.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Highlight overlay: a non-interactive mirror of the textarea text with
              `@section` tokens painted as code pills. Same box metrics + wrapping
              as the textarea (see the shared px/py/leading/whitespace classes) so
              the pills sit exactly under the real glyphs. Only shown when the text
              has a mention; otherwise the textarea renders its own (opaque) text. */}
          {hasMention && (
            <div
              ref={overlayRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-base leading-normal text-foreground"
            >
              {/* Render the FULL token text (backticks included) so the overlay
                  occupies the exact same character cells as the textarea — the
                  caret stays glyph-aligned. Pill = a background tint + accent color
                  ONLY (no padding / weight / spacing change), so glyph metrics
                  match the textarea exactly and the highlight never drifts. */}
              {segmentMentions(input).map((seg, i) =>
                seg.mention ? (
                  <span key={i} className="rounded bg-primary-subtle text-primary">
                    {seg.text}
                  </span>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
              {/* trailing newline guard: a textarea shows a final empty line; mirror it. */}
              {input.endsWith("\n") ? "\n" : ""}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className={
              "relative min-h-[5.5rem] max-h-64 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-base leading-normal caret-foreground " +
              (hasMention ? "text-transparent" : "text-foreground") +
              " " +
              (dragOver && canAttach ? "border-primary ring-2 ring-ring" : "border-border")
            }
            rows={3}
            placeholder={t("placeholder")}
            value={input}
            disabled={busy}
            onChange={(e) => {
              setInput(e.target.value);
              setMentionCaret(e.target.selectionStart);
              setMentionIndex(0);
            }}
            onScroll={syncOverlayScroll}
            // Keep the active-mention detection in sync as the caret moves by
            // click or arrow keys (not just typing).
            onClick={(e) => setMentionCaret((e.target as HTMLTextAreaElement).selectionStart)}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
                setMentionCaret((e.target as HTMLTextAreaElement).selectionStart);
              }
            }}
            onKeyDown={(e) => {
              // While the @section dropdown is open, arrows/enter/tab drive it and
              // Esc closes it — none of these reach the send/newline logic.
              if (mentionOpen) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionMatches.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(mentionMatches[Math.min(mentionIndex, mentionMatches.length - 1)].name);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMentionCaret(null);
                  return;
                }
              }
              if (e.key !== "Enter") return;
              if (decideSendOnEnter(enterMode, { shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey })) {
                e.preventDefault();
                void onSend();
              }
            }}
            onDragOver={(e) => {
              if (!canAttach) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              setDragOver(false);
              if (!canAttach || e.dataTransfer.files.length === 0) return;
              e.preventDefault();
              void addFiles(e.dataTransfer.files);
            }}
            aria-label={t("placeholder")}
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = ""; // allow re-picking the same file
          }}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                disabled={busy || uploading}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="rounded-md border border-border px-2 py-1 text-foreground-muted hover:text-foreground disabled:opacity-50"
                aria-label={t("attach.add")}
                title={t("attach.add")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full left-0 z-50 mb-1 w-64 overflow-hidden rounded-md border border-border bg-surface-raised shadow-lg"
                >
                  <AttachMenuItem
                    label={t("attach.readDisk")}
                    hint={canAttach ? undefined : t("attach.textOnly")}
                    disabled={!canAttach}
                    onClick={() => {
                      setMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  />
                  <AttachMenuItem
                    label={t("attach.readGallery")}
                    hint={canAttach ? undefined : t("attach.textOnly")}
                    disabled={!canAttach}
                    onClick={() => {
                      setMenuOpen(false);
                      setGallery("read");
                    }}
                  />
                  <AttachMenuItem
                    label={t("attach.insertGallery")}
                    hint={t("attach.insertGalleryHint")}
                    onClick={() => {
                      setMenuOpen(false);
                      setGallery("reference");
                    }}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleEnterMode}
              className="rounded-md border border-border px-2 py-1 text-foreground-muted hover:text-foreground"
              aria-label={t("enterMode.aria")}
              title={t("enterMode.aria")}
            >
              {enterMode === "send" ? t("enterMode.send") : t("enterMode.newline")}
            </button>
          </div>
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-muted px-4 py-2 text-foreground hover:bg-surface"
              aria-label={t("stop")}
              title={t("stop")}
            >
              <Spinner />
              {t("stop")}
            </button>
          ) : (
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={
                uploading ||
                (input.trim() === "" && attachments.length === 0 && references.length === 0)
              }
            >
              {uploading ? t("sending") : t("send")}
            </button>
          )}
        </div>
      </form>

      {gallery && (
        <GalleryPicker
          title={gallery === "read" ? t("gallery.readTitle") : t("gallery.insertTitle")}
          confirmLabel={gallery === "read" ? t("gallery.confirmRead") : t("gallery.confirmInsert")}
          onConfirm={gallery === "read" ? addGalleryToRead : addGalleryToReference}
          onClose={() => setGallery(null)}
        />
      )}
    </div>
  );
}

/** A small spinning loader (CSS `animate-spin`). */
function Spinner() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.5} strokeLinecap="round" className="animate-spin" aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/** One row in the `+` attach menu. */
function AttachMenuItem({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span>{label}</span>
      {hint && <span className="text-xs text-foreground-muted">{hint}</span>}
    </button>
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
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-surface px-2 py-1 text-sm">
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

function UserBubble({
  content,
  media,
  label,
}: {
  content: string;
  media?: BubbleMedia[];
  label: string;
}) {
  return (
    <div className="self-end max-w-[80%]">
      <p className="mb-1 text-foreground-muted">{label}</p>
      <div className="rounded-lg bg-primary-subtle px-3 py-2 text-foreground">
        {media && media.length > 0 && (
          // Attached/referenced images render inline as thumbnails so the turn
          // shows what was sent, not just a filename. They open full-size in a tab.
          <div className="mb-2 flex flex-wrap gap-1.5">
            {media.map((m) => (
              <a
                key={m.url}
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-20 w-20 overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={m.name}
              >
                <img src={m.url} alt={m.name} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
        {content && <p className="whitespace-pre-wrap">{content}</p>}
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  tools,
  parts,
  label,
  thinking,
  t,
}: {
  content: string;
  tools: ToolResult[];
  parts?: AssistantPart[];
  label: string;
  thinking: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  // Ordered parts (streaming + new threads) interleave text and tool cards
  // exactly as the model emitted them. Older threads with no `parts` fall back to
  // the flat content-then-tools layout.
  const ordered: AssistantPart[] =
    parts ??
    [
      ...(content ? [{ kind: "text", text: content } as AssistantPart] : []),
      ...tools.map((result) => ({ kind: "tool", result }) as AssistantPart),
    ];
  const hasText = ordered.some((p) => p.kind === "text" && p.text.trim() !== "");

  return (
    <div className="self-start max-w-[80%]">
      <p className="mb-1 text-foreground-muted">{label}</p>
      {/* Thinking placeholder only before any content has streamed in. */}
      {!hasText && thinking && (
        <div className="rounded-lg bg-surface-muted px-3 py-2 text-foreground">
          <span className="flex items-center gap-2 text-foreground-muted">
            <Spinner />
            {t("thinking")}
          </span>
        </div>
      )}
      {groupParts(ordered).map((group, gi) =>
        group.kind === "tools" ? (
          // Consecutive tool calls flow side by side, wrapping to fit the width.
          <div key={gi} className="mt-2 flex flex-wrap items-start gap-1.5">
            {group.tools.map((result, i) => (
              <ToolCard key={i} tool={result} t={t} />
            ))}
          </div>
        ) : // Skip whitespace-only chunks — models emit `'  '` between tool calls,
        // which would otherwise render as an empty bubble.
        group.text.trim() ? (
          <div
            key={gi}
            className="rounded-lg bg-surface-muted px-3 py-2 text-foreground [&:not(:first-child)]:mt-2"
          >
            <Markdown source={group.text} />
          </div>
        ) : null,
      )}
    </div>
  );
}

/**
 * Collapse an ordered part list into render groups: a text part is its own
 * group; a run of consecutive tool parts becomes ONE `tools` group so they can
 * be laid out in a single wrapping flex row.
 */
type PartGroup =
  | { kind: "text"; text: string }
  | { kind: "tools"; tools: ToolResult[] };

function groupParts(parts: AssistantPart[]): PartGroup[] {
  const out: PartGroup[] = [];
  for (const p of parts) {
    if (p.kind === "tool") {
      const last = out[out.length - 1];
      if (last?.kind === "tools") last.tools.push(p.result);
      else out.push({ kind: "tools", tools: [p.result] });
    } else {
      out.push({ kind: "text", text: p.text });
    }
  }
  return out;
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
  // On expand, scroll the card fully into view so a card near the bottom of the
  // transcript isn't left half-clipped under the fold (the reported bug).
  return (
    <details
      // Slim, inline pill — collapsed cards flow side by side (flex-wrap on the
      // parent), expanding to full width when opened.
      className={`group rounded border px-2 py-0.5 text-xs open:w-full open:py-1 ${cls}`}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) {
          requestAnimationFrame(() =>
            e.currentTarget?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
          );
        }
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5">
        <span aria-hidden className="text-foreground-muted transition-transform group-open:rotate-90">
          ›
        </span>
        <span className="font-mono">{tool.name}</span>
        {summary && <span className="truncate text-foreground-muted">{summary}</span>}
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
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-surface px-2 py-1 text-foreground">
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
