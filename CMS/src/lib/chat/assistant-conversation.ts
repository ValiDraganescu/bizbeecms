/**
 * CMS-assistant conversation persistence — the PURE half (assistant-conversations
 * epic). Mirrors the guest-chat conversation record (`chat_conversation` rows with
 * a gateway-fidelity `payload`) for the ADMIN AI-assistant widget, so operator
 * conversations get the same analytics + lossless download as chat agents.
 *
 * Storage reuses the `chat_conversation` table under the reserved agent id
 * {@link ASSISTANT_AGENT_ID}: real agents mint UUID ids (`crypto.randomUUID()`),
 * so the sentinel can never collide, and the store's cross-agent guard keeps
 * assistant rows and guest rows from ever overwriting each other. Reuse also
 * means export/import behavior is inherited for free (conversations are never
 * exported and never wiped by an import).
 *
 * CACHING CONTRACT: the stored payload's `messages` are replayed VERBATIM as the
 * next request's model context, with ONLY the new user turn appended — the
 * provider's prompt-cache prefix stays byte-stable across turns (same rule as
 * guest rehydration; user directive 2026-07-03: never mutate replayed history).
 *
 * NO @/ / React / D1 imports — runs under dep-free `node --test`.
 */
import {
  capConversationPayload,
  type ConversationPayload,
} from "../public-chat/core.ts";

/**
 * Reserved `chat_conversation.agentId` for CMS-assistant conversations. Real
 * chat agents get `crypto.randomUUID()` ids, so this can never collide.
 */
export const ASSISTANT_AGENT_ID = "cms-assistant";

// Accepts widget-minted UUIDs AND legacy `th_…` thread ids (the widget reuses
// the saved-thread id as the conversation id so history and the stored
// conversation stay one record).
const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Extract + validate the optional `conversationId` from the UNTRUSTED chat body.
 * Returns "" on absence/violation — the request is still answered, just never
 * persisted or rehydrated (same degradation as the guest widget).
 */
export function parseAssistantConversationId(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const raw = (body as { conversationId?: unknown }).conversationId;
  return typeof raw === "string" && CONVERSATION_ID_RE.test(raw) ? raw : "";
}

/** The client wire message shape we inspect (structural — stays dep-free). */
type WireMessage = { role?: unknown; content?: unknown };

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Rebuild the model context from the STORED gateway transcript (full fidelity —
 * assistant `tool_calls` turns and `role:"tool"` results included) plus the
 * client's NEW user turn, appended VERBATIM (string or attachment content array).
 * This is what keeps the provider prompt-cache prefix stable: every request
 * replays the exact bytes of the prior turns and only appends.
 *
 * The client transcript stays the truth for what the operator SAW; the stored
 * transcript must agree with it or the caller falls back to the client-built
 * history (`buildModelHistory` output — the pre-rehydration behavior). Returns
 * null unless:
 *  - `payloadJson` parses and its `messages` is a non-empty array,
 *  - the client's LAST message is the new `user` turn,
 *  - stored `user` turns count exactly the client's PRIOR `user` turns (1:1 in
 *    both views, unlike assistant turns which fan out into tool rounds). A
 *    desynced store — failed persist, retried/aborted turn, stale thread — must
 *    never resurrect a different conversation.
 *
 * The size cap can behead the stored transcript mid-round, so leading entries
 * are dropped to the first `user` turn — the gateway never sees an orphan tool
 * result.
 */
export function rehydrateAssistantHistory(
  payloadJson: string,
  clientMessages: ReadonlyArray<WireMessage>,
): Array<Record<string, unknown>> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  const raw = asRecord(parsed)?.messages;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const newTurn = clientMessages[clientMessages.length - 1];
  if (!newTurn || newTurn.role !== "user") return null;

  const entries: Record<string, unknown>[] = [];
  for (const e of raw) {
    const rec = asRecord(e);
    if (rec) entries.push(rec);
  }
  const start = entries.findIndex((e) => e.role === "user");
  if (start === -1) return null;
  const stored = entries.slice(start);

  const storedUsers = stored.filter((e) => e.role === "user").length;
  const clientPriorUsers = clientMessages
    .slice(0, -1)
    .filter((m) => m.role === "user").length;
  if (storedUsers !== clientPriorUsers) return null;

  return [...stored, newTurn as Record<string, unknown>];
}

/**
 * Assemble the persisted conversation payload from the reframe transcript —
 * the assistant twin of the guest route's `buildConversationPayload`. Drops the
 * leading system turn (kept separately in `payload.system`), stamps a server
 * UTC `at` on every entry that doesn't already carry one, records the admin
 * page `context` the turn ran in, and size-caps the whole document. Timezone
 * fields stay empty — the operator's clock isn't part of the admin contract.
 */
export function buildAssistantPayload(input: {
  transcript: ReadonlyArray<Record<string, unknown>>;
  system: string;
  tools: unknown[];
  model: string;
  context: string;
  usage: { promptTokens: number; completionTokens: number };
  now?: Date;
}): ConversationPayload {
  const nowUtc = (input.now ?? new Date()).toISOString();
  const messages = input.transcript
    .filter((m) => m.role !== "system")
    .map((m) => ({ ...m, at: typeof m.at === "string" ? m.at : nowUtc }));

  return capConversationPayload({
    version: 1,
    system: input.system,
    tools: input.tools,
    model: input.model,
    context: input.context,
    timezone: "",
    utcOffsetMinutes: 0,
    messages,
    usage: input.usage,
  });
}
