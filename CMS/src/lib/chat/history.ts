/**
 * Pure helpers for AI-assistant conversation history (Milestone 2, ai-assistant
 * goal, Slice 4 sub-slice 3). NO @/ / D1 / React imports — node-testable. The
 * REST route (`api/chat/history`) and the store own the binding; this module
 * only shapes + validates the UNTRUSTED save body and derives the list label.
 *
 * A thread is `{ id, title, messages }`: `messages` is the transcript TEXT only
 * (`[{role, content}]`) — tool cards are re-derived client-side, not stored.
 */

export type ThreadRole = "user" | "assistant" | "system";
export type ThreadMessage = { role: ThreadRole; content: string };

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
    messages.push({
      role: m.role as ThreadRole,
      content: m.content.length > MAX_CONTENT ? m.content.slice(0, MAX_CONTENT) : m.content,
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
      out.push({ role: r as ThreadRole, content: c });
    }
  }
  return out;
}
