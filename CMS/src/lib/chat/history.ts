/**
 * Pure helpers for AI-assistant conversation history (Milestone 2, ai-assistant
 * goal, Slice 4 sub-slice 3). NO @/ / D1 / React imports — node-testable. The
 * REST route (`api/chat/history`) and the store own the binding; this module
 * only shapes + validates the UNTRUSTED save body and derives the list label.
 *
 * A thread is `{ id, title, messages }`: `messages` is `[{role, content, tools?}]`.
 * `tools` (assistant turns only) is the array of tool-call cards for that turn —
 * stored opaquely as plain objects (the client's `ToolResult` shape incl.
 * input/output) so reloaded cards expand exactly like live ones. The pure layer
 * never imports `ToolResult` (stays node-testable); it just bounds + sanitizes.
 */

export type ThreadRole = "user" | "assistant" | "system";
/** A stored tool-call card: an opaque plain object (the client's ToolResult). */
export type StoredTool = Record<string, unknown>;
/** An inline media item shown in a user bubble ({name, url, mime?}). */
export type StoredMedia = { name: string; url: string; mime?: string };
export type ThreadMessage = {
  role: ThreadRole;
  content: string;
  tools?: StoredTool[];
  // Ordered display parts ({kind:"text"|"tool", …}) so reloaded assistant turns
  // interleave text and tool cards exactly as streamed. Sanitized like `tools`.
  parts?: StoredTool[];
  // Inline images shown in a user bubble (read attachments / referenced URLs).
  media?: StoredMedia[];
};

const MAX_TOOLS = 50;
const MAX_MEDIA = 20;
// parts = tool cards + interleaved text segments, so a turn can have more parts
// than tools. Cap generously; the content cap already bounds total size.
const MAX_PARTS = 120;

export type ThreadInput = {
  id: string;
  title: string;
  messages: ThreadMessage[];
};

const MAX_TITLE = 80;
const MAX_MESSAGES = 200;
const MAX_CONTENT = 20_000;
const ROLES = new Set<ThreadRole>(["user", "assistant", "system"]);

/** Derive a short list label from the first user message (fallback if none). */
export function deriveTitle(
  messages: ReadonlyArray<{ role?: unknown; content?: unknown }>,
  fallback = "Conversation",
): string {
  const firstUser = messages.find(
    (m) => m && m.role === "user" && typeof m.content === "string" && m.content.trim() !== "",
  );
  const raw = typeof firstUser?.content === "string" ? firstUser.content : "";
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine === "") return fallback;
  return oneLine.length > MAX_TITLE ? oneLine.slice(0, MAX_TITLE - 1) + "…" : oneLine;
}

/**
 * Bound + sanitize a turn's `tools` into plain objects, or undefined. Keeps only
 * array-of-plain-object entries (drops primitives/null/nested arrays), caps the
 * count, and JSON-roundtrips each to strip anything non-serializable (functions,
 * cycles) so the column is always clean JSON. Returns undefined when empty.
 */
export function sanitizeTools(raw: unknown, cap = MAX_TOOLS): StoredTool[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: StoredTool[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    try {
      out.push(JSON.parse(JSON.stringify(item)) as StoredTool);
    } catch {
      continue; // non-serializable → drop
    }
    if (out.length >= cap) break;
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Bound + sanitize a user turn's inline `media` into `{name, url, mime?}` items,
 * or undefined. Keeps only entries with a string name + url; the url must be a
 * relative path, http(s), or a data: URL (no javascript:/other schemes). Caps
 * the count. Returns undefined when empty.
 */
export function sanitizeMedia(raw: unknown, cap = MAX_MEDIA): StoredMedia[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: StoredMedia[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const m = item as Record<string, unknown>;
    if (typeof m.name !== "string" || typeof m.url !== "string") continue;
    const url = m.url;
    const safe = url.startsWith("/") || /^https?:\/\//i.test(url) || url.startsWith("data:image/");
    if (!safe) continue;
    out.push({
      name: m.name.slice(0, 200),
      url: url.slice(0, 5000),
      ...(typeof m.mime === "string" ? { mime: m.mime.slice(0, 100) } : {}),
    });
    if (out.length >= cap) break;
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Validate + normalize an UNTRUSTED save body into a `ThreadInput`, or return
 * the reason it's rejected. Drops malformed messages, bounds counts/lengths,
 * and auto-derives the title when absent. The id, if absent/garbage, is left to
 * the caller to mint (so a fresh thread gets a server-side id).
 */
export function validateThreadInput(
  body: unknown,
): { ok: true; input: Omit<ThreadInput, "id"> & { id: string | null } } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.messages)) {
    return { ok: false, error: "messages must be an array" };
  }
  const messages: ThreadMessage[] = [];
  for (const raw of b.messages) {
    if (typeof raw !== "object" || raw === null) continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.role !== "string" || !ROLES.has(m.role as ThreadRole)) continue;
    if (typeof m.content !== "string") continue;
    const tools = m.role === "assistant" ? sanitizeTools(m.tools) : undefined;
    const parts = m.role === "assistant" ? sanitizeTools(m.parts, MAX_PARTS) : undefined;
    const media = m.role === "user" ? sanitizeMedia(m.media) : undefined;
    messages.push({
      role: m.role as ThreadRole,
      content: m.content.length > MAX_CONTENT ? m.content.slice(0, MAX_CONTENT) : m.content,
      ...(tools ? { tools } : {}),
      ...(parts ? { parts } : {}),
      ...(media ? { media } : {}),
    });
    if (messages.length >= MAX_MESSAGES) break;
  }
  if (messages.length === 0) {
    return { ok: false, error: "messages must contain at least one valid {role, content}" };
  }

  const title =
    typeof b.title === "string" && b.title.trim() !== ""
      ? b.title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE)
      : deriveTitle(messages);

  const id = typeof b.id === "string" && b.id.trim() !== "" ? b.id.trim().slice(0, 64) : null;

  return { ok: true, input: { id, title, messages } };
}

/** Mint a thread id (sortable-ish + random). Crypto-free so it stays pure/portable. */
export function newThreadId(): string {
  return `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Defensive parse of a stored `messages` JSON column into clean ThreadMessages. */
export function parseStoredMessages(raw: unknown): ThreadMessage[] {
  if (typeof raw !== "string" || raw === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ThreadMessage[] = [];
  for (const m of parsed) {
    if (typeof m !== "object" || m === null) continue;
    const r = (m as Record<string, unknown>).role;
    const c = (m as Record<string, unknown>).content;
    if (typeof r === "string" && ROLES.has(r as ThreadRole) && typeof c === "string") {
      const rec = m as Record<string, unknown>;
      const tools = r === "assistant" ? sanitizeTools(rec.tools) : undefined;
      const parts = r === "assistant" ? sanitizeTools(rec.parts, MAX_PARTS) : undefined;
      const media = r === "user" ? sanitizeMedia(rec.media) : undefined;
      out.push({
        role: r as ThreadRole,
        content: c,
        ...(tools ? { tools } : {}),
        ...(parts ? { parts } : {}),
        ...(media ? { media } : {}),
      });
    }
  }
  return out;
}
