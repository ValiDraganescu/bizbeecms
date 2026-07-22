/**
 * Inline chat-agents context for the AI assistant.
 *
 * Sibling channel to `page-context.ts` / `data-sources-context.ts`, for the
 * Chat Agents admin. Two publishers, one channel:
 *   - /admin/chat-agents publishes the agent ROSTER (summaries) so the
 *     assistant can answer/act without a list_chat_agents round-trip;
 *   - /admin/chat-agents/[id] publishes the ONE agent being edited, with its
 *     FULL config, so the assistant edits that agent directly without a
 *     list/get discovery round-trip.
 *
 * `formatChatAgentsContext` is the PURE bit (the only logic worth testing).
 * Relative core import keeps it node-testable (dep-free `node --test`).
 */

import type {
  ChatAgentLimits,
  CollectionAllowEntry,
  DataSourceAllowEntry,
} from "../public-chat/core.ts";

/** One agent as shown on the roster (list page). */
export interface AgentSummaryInfo {
  id: string;
  name: string;
  enabled: boolean;
  model: string | null;
  dataSourceTools: number;
  collectionTools: number;
}

/** The agent open on the edit sub-page, full config. */
export interface AgentDetailInfo {
  id: string;
  name: string;
  enabled: boolean;
  model: string | null;
  welcomeMessage: string | null;
  systemPrompt: string;
  limits: ChatAgentLimits;
  dataSources: DataSourceAllowEntry[];
  collections: CollectionAllowEntry[];
}

export interface ChatAgentsContextInput {
  /** The roster (list page). Ignored when `editing` is set. */
  agents?: AgentSummaryInfo[];
  /** The one agent being edited (edit sub-page) — wins over `agents`. */
  editing?: AgentDetailInfo | null;
}

// Keep the block bounded: a runaway prompt or allowlist is summarized, and the
// model is told get_chat_agent returns the full record.
export const MAX_CONTEXT_AGENTS = 20;
export const MAX_CONTEXT_PROMPT_CHARS = 4000;
export const MAX_CONTEXT_ENTRIES = 24;

const GRANULAR_TOOLS_HINT =
  "Prefer the granular edit tools — update_chat_agent_settings, " +
  "set_chat_agent_limits, set_chat_agent_data_source / remove_chat_agent_data_source, " +
  "set_chat_agent_collection / remove_chat_agent_collection — they change ONLY what " +
  "you pass. Reserve update_chat_agent (full-replace) for a full reconfiguration.";

function modelLabel(model: string | null): string {
  return model ?? "site default";
}

/** One roster line: name, id, state, model, allowlist sizes. */
function agentLine(a: AgentSummaryInfo): string {
  return (
    `- "${a.name}" (id: ${a.id}, ${a.enabled ? "enabled" : "DISABLED"}, ` +
    `model: ${modelLabel(a.model)}) — ${a.dataSourceTools} data-source tools, ` +
    `${a.collectionTools} collections`
  );
}

function limitsLine(limits: ChatAgentLimits): string {
  return (
    `perIpPerMinute=${limits.perIpPerMinute}, perIpPerDay=${limits.perIpPerDay}, ` +
    `siteMessagesPerDay=${limits.siteMessagesPerDay}, ` +
    `maxMessagesPerConversation=${limits.maxMessagesPerConversation}, ` +
    `maxUserMessageLen=${limits.maxUserMessageLen}, maxToolRounds=${limits.maxToolRounds}, ` +
    `maxTokensPerResponse=${limits.maxTokensPerResponse}`
  );
}

function dataSourceLine(e: DataSourceAllowEntry): string {
  const cap =
    e.maxCallsPerConversation !== undefined
      ? `, maxCalls ${e.maxCallsPerConversation}`
      : "";
  return `  - "${e.toolName}" (sourceId: ${e.sourceId}, requestId: ${e.requestId}${cap}): ${e.description}`;
}

function collectionLine(e: CollectionAllowEntry): string {
  const ops = [
    e.canQuery ? "query" : null,
    e.canCreate ? "create" : null,
    e.canUpdate ? "update" : null,
  ].filter(Boolean);
  const opsPart = ops.length > 0 ? ops.join("+") : "no ops enabled";
  const lookupPart =
    e.canUpdate && e.lookupFields && e.lookupFields.length > 0
      ? `; lookup: ${e.lookupFields.join("+")}`
      : "";
  return `  - "${e.collection}" [${opsPart}${lookupPart}]: ${e.description}`;
}

/** The full-config block for the agent open on the edit sub-page. */
function formatEditing(a: AgentDetailInfo): string {
  const lines: string[] = [];
  lines.push(
    `[Chat agent edit context] The user is on the EDIT page for the chat agent ` +
      `"${a.name}" (id: ${a.id}, ${a.enabled ? "enabled" : "DISABLED"}, ` +
      `model: ${modelLabel(a.model)}). Its FULL current config is below — do NOT ` +
      `call list_chat_agents or get_chat_agent to rediscover it. Apply chat-agent ` +
      `requests to THIS agent unless they name another. ${GRANULAR_TOOLS_HINT}`,
  );
  lines.push(
    `Welcome message: ${a.welcomeMessage ? `"${a.welcomeMessage}"` : "(none)"}`,
  );
  lines.push(`Limits: ${limitsLine(a.limits)}`);

  if (a.dataSources.length === 0) {
    lines.push("Data-source tools: (none)");
  } else {
    lines.push(`Data-source tools (${a.dataSources.length}):`);
    for (const e of a.dataSources.slice(0, MAX_CONTEXT_ENTRIES)) {
      lines.push(dataSourceLine(e));
    }
    const more = a.dataSources.length - MAX_CONTEXT_ENTRIES;
    if (more > 0) lines.push(`  …and ${more} more (get_chat_agent lists all)`);
  }

  if (a.collections.length === 0) {
    lines.push("Collections: (none)");
  } else {
    lines.push(`Collections (${a.collections.length}):`);
    for (const e of a.collections.slice(0, MAX_CONTEXT_ENTRIES)) {
      lines.push(collectionLine(e));
    }
    const more = a.collections.length - MAX_CONTEXT_ENTRIES;
    if (more > 0) lines.push(`  …and ${more} more (get_chat_agent lists all)`);
  }

  const prompt = a.systemPrompt.slice(0, MAX_CONTEXT_PROMPT_CHARS);
  const truncated =
    a.systemPrompt.length > MAX_CONTEXT_PROMPT_CHARS
      ? "\n…(truncated — call get_chat_agent for the full prompt)"
      : "";
  lines.push(`System prompt:\n"""\n${prompt}${truncated}\n"""`);

  return lines.join("\n");
}

/** The roster block for the list page. */
function formatRoster(agents: AgentSummaryInfo[]): string {
  if (agents.length === 0) {
    return (
      `[Chat agents context] This site has NO chat agents yet — do not call ` +
      `list_chat_agents; create one with create_chat_agent when asked.`
    );
  }
  const lines = agents.slice(0, MAX_CONTEXT_AGENTS).map(agentLine);
  const more = agents.length - MAX_CONTEXT_AGENTS;
  if (more > 0) lines.push(`…and ${more} more agents`);
  return (
    `[Chat agents context] This site's guest-facing chat agents:\n` +
    `${lines.join("\n")}\n` +
    `Address them by id or name directly — do NOT call list_chat_agents to ` +
    `rediscover them. For an agent's full config call get_chat_agent (or the ` +
    `user can open its edit page). ${GRANULAR_TOOLS_HINT}`
  );
}

/**
 * The inline context block prepended to the next user message. Returns "" for a
 * null/empty input (nothing published). `editing` wins over `agents`.
 */
export function formatChatAgentsContext(
  c: ChatAgentsContextInput | null | undefined,
): string {
  if (!c) return "";
  if (c.editing) return formatEditing(c.editing);
  if (c.agents) return formatRoster(c.agents);
  return "";
}

// Module-level latest value + subscribers — same pattern as its sibling stores.
let active = "";
const listeners = new Set<() => void>();

/** Publish the current chat-agents context (or clear it with null). */
export function setActiveChatAgentsContext(
  c: ChatAgentsContextInput | null | undefined,
): void {
  const next = formatChatAgentsContext(c);
  if (next === active) return;
  active = next;
  for (const fn of listeners) fn();
}

/** The latest published context block, or "" when nothing is set. */
export function getActiveChatAgentsContext(): string {
  return active;
}

/** Subscribe to context changes (for `useSyncExternalStore`). */
export function subscribeActiveChatAgentsContext(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
