/**
 * public-guest-chatbots Slice 6 — AI tools for guest-facing CHAT AGENTS.
 *
 *   - list_chat_agents   → the configured agents (id, name, enabled, model, a
 *                          limit summary + allowlisted tool counts) so the model
 *                          knows what exists before creating/editing/deleting.
 *   - create_chat_agent  → define an agent: persona (systemPrompt), model,
 *                          welcome message, usage limits, and the allowlist of
 *                          data-source saved requests + collections the guest bot
 *                          may touch.
 *   - update_chat_agent  → FULL-REPLACE the supplied fields of an existing agent
 *                          (addressed by id OR name), same semantics as the other
 *                          update tools — the caller sends the whole config.
 *   - delete_chat_agent  → remove an agent (by id OR name).
 *
 * Mirrors `data-source-tools.ts`: the PURE concerns (tool schemas + arg shaping +
 * response formatting) live here so they're unit-tested with dep-free
 * `node --test` (hence the relative `.ts` imports). The CF-coupled work — store
 * CRUD, JSON-column round-trip — is wired in `tool-dispatch.ts`. The config
 * shapes/defaults/ceilings + the strict validator are owned by the pure core in
 * `../public-chat/core.ts`; this module never re-defines them.
 */
import {
  validateAgentConfigInput,
  DEFAULT_LIMITS,
  LIMIT_CEILINGS,
  type ChatAgentConfig,
} from "../public-chat/core.ts";

export type ArgResult<T> = { ok: true; value: T } | { ok: false; error: string };

function asRecord(args: unknown): Record<string, unknown> | null {
  return typeof args === "object" && args !== null && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : null;
}

// ── Shared schema fragments (create + update share the config shape) ──────────

const LIMITS_SCHEMA = {
  type: "object",
  description:
    "Optional usage limits for abuse prevention — OMIT a key to use its default. " +
    "Message-count based (per-response token cap is separate). Each is clamped to " +
    "its ceiling. Fields (default → ceiling): " +
    `perIpPerMinute (${DEFAULT_LIMITS.perIpPerMinute} → ${LIMIT_CEILINGS.perIpPerMinute}) requests one IP may send per minute; ` +
    `perIpPerDay (${DEFAULT_LIMITS.perIpPerDay} → ${LIMIT_CEILINGS.perIpPerDay}) per IP per day; ` +
    `siteMessagesPerDay (${DEFAULT_LIMITS.siteMessagesPerDay} → ${LIMIT_CEILINGS.siteMessagesPerDay}) total across the whole site per day (the cost backstop); ` +
    `maxMessagesPerConversation (${DEFAULT_LIMITS.maxMessagesPerConversation} → ${LIMIT_CEILINGS.maxMessagesPerConversation}) messages before a visitor must start a new chat; ` +
    `maxUserMessageLen (${DEFAULT_LIMITS.maxUserMessageLen} → ${LIMIT_CEILINGS.maxUserMessageLen}) characters per visitor message; ` +
    `maxToolRounds (${DEFAULT_LIMITS.maxToolRounds} → ${LIMIT_CEILINGS.maxToolRounds}) tool-call rounds per reply; ` +
    `maxTokensPerResponse (${DEFAULT_LIMITS.maxTokensPerResponse} → ${LIMIT_CEILINGS.maxTokensPerResponse}) output tokens per reply (also capped by the selected model's own output limit at request time).`,
  properties: {
    perIpPerMinute: { type: "number" },
    perIpPerDay: { type: "number" },
    siteMessagesPerDay: { type: "number" },
    maxMessagesPerConversation: { type: "number" },
    maxUserMessageLen: { type: "number" },
    maxToolRounds: { type: "number" },
    maxTokensPerResponse: { type: "number" },
  },
} as const;

const DATA_SOURCES_SCHEMA = {
  type: "array",
  description:
    "Allowlist of external-API saved requests the guest bot may call as tools. " +
    "Each entry surfaces the request as ONE guest tool. `sourceId` and `requestId` " +
    "MUST reference an EXISTING data source + saved request (call list_data_sources " +
    "to get real ids — never invent them). Omit or pass [] for a bot with no API access.",
  items: {
    type: "object",
    properties: {
      sourceId: { type: "string", description: "Existing data source id (from list_data_sources)." },
      requestId: { type: "string", description: "Existing saved request id on that source (from list_data_sources)." },
      toolName: { type: "string", description: "Short label for the guest tool (slugified into the bot's `ds_<slug>` tool name)." },
      description: { type: "string", description: "What this tool does — the guest bot reads this to decide when to call it." },
      maxCallsPerConversation: { type: "number", description: "Optional per-conversation call cap for this tool." },
    },
    required: ["sourceId", "requestId", "toolName", "description"],
  },
} as const;

const COLLECTIONS_SCHEMA = {
  type: "array",
  description:
    "Allowlist of collections the guest bot may operate on. Each entry names a " +
    "`content_<slug>` table (discover them with query_collection) and the permitted " +
    "operations. `canQuery` reads PUBLISHED items only; `canCreate` lands new items " +
    "as DRAFTS for operator review; `canUpdate` patches items and also forces them " +
    "back to DRAFT — it REQUIRES a non-empty `lookupFields` (exact-match fields that " +
    "scope an update to exactly one item; if zero or many match, the update is " +
    "refused). Omit or pass [] for a bot with no collection access.",
  items: {
    type: "object",
    properties: {
      collection: { type: "string", description: "The content_<slug> table name (from query_collection)." },
      description: { type: "string", description: "What the collection holds — the guest bot reads this." },
      canQuery: { type: "boolean", description: "Allow querying PUBLISHED items (equality filters on declared fields). Default false." },
      canCreate: { type: "boolean", description: "Allow creating items — they land as DRAFTS. Default false." },
      canUpdate: { type: "boolean", description: "Allow updating items (forced back to DRAFT). Requires lookupFields. Default false." },
      lookupFields: {
        type: "array",
        items: { type: "string" },
        description: "Exact-match field names that scope an update to one item. Required when canUpdate is true.",
      },
    },
    required: ["collection", "description"],
  },
} as const;

const AGENT_CORE_PROPERTIES = {
  name: { type: "string", description: "Unique agent name (1–100 chars); also usable as the GuestChat block's `agent` ref." },
  systemPrompt: { type: "string", description: "The bot's persona/instructions — what it is, its tone, and what it should/shouldn't do." },
  model: { type: "string", description: "Optional model id; omit/null to use the site's default chat model." },
  enabled: { type: "boolean", description: "Whether the bot is live on published pages (default true). A disabled agent's block shows nothing." },
  welcomeMessage: { type: "string", description: "Optional greeting the widget shows before the visitor's first message." },
  limits: LIMITS_SCHEMA,
  dataSources: DATA_SOURCES_SCHEMA,
  collections: COLLECTIONS_SCHEMA,
} as const;

// ── Tool schemas (OpenAI/Workers-AI function-calling shape) ───────────────────

export const LIST_CHAT_AGENTS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_chat_agents",
    description:
      "List the site's guest-facing chat agents (guest chatbots placed on published " +
      "pages via a GuestChat block). Each result shows the agent's id, name, enabled " +
      "flag, model, a summary of its usage limits, and how many data-source + " +
      "collection tools it allowlists — never the raw config JSON. Use this to " +
      "discover what exists before create/update/delete.",
    parameters: { type: "object", properties: {} },
  },
} as const;

export const CREATE_CHAT_AGENT_TOOL = {
  type: "function" as const,
  function: {
    name: "create_chat_agent",
    description:
      "Create a guest-facing chat agent (a chatbot a visitor talks to on a published " +
      "page). Set its persona (systemPrompt), optional model + welcome message, usage " +
      "limits, and the allowlist of what it may touch: external-API saved requests " +
      "(dataSources) and collections (collections). The guest bot ONLY ever gets the " +
      "allowlisted tools — queries see published items, creates/updates land as " +
      "drafts. Reference EXISTING data sources/requests (list_data_sources) and " +
      "collections (query_collection) — do not invent ids. After creating, place it on " +
      "a page with a GuestChat block in the Page Builder/Pages assistant.",
    parameters: {
      type: "object",
      properties: AGENT_CORE_PROPERTIES,
      required: ["name", "systemPrompt"],
    },
  },
} as const;

export const UPDATE_CHAT_AGENT_TOOL = {
  type: "function" as const,
  function: {
    name: "update_chat_agent",
    description:
      "Update an existing chat agent, addressed by `agent` (its id OR name). " +
      "FULL-REPLACE for every field you supply: pass the WHOLE config (e.g. the " +
      "entire dataSources/collections allowlist, not a delta) — omitted top-level " +
      "fields keep their stored value, but a supplied array REPLACES the stored one. " +
      "Same limit/allowlist shapes as create_chat_agent.",
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", description: "The target agent's id OR name (list_chat_agents shows both)." },
        ...AGENT_CORE_PROPERTIES,
      },
      required: ["agent"],
    },
  },
} as const;

export const DELETE_CHAT_AGENT_TOOL = {
  type: "function" as const,
  function: {
    name: "delete_chat_agent",
    description:
      "Delete a chat agent by `agent` (its id OR name). Any GuestChat block still " +
      "referencing it will then render nothing — remove or repoint those blocks in " +
      "the Page Builder.",
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", description: "The target agent's id OR name (list_chat_agents shows both)." },
      },
      required: ["agent"],
    },
  },
} as const;

// ── Pure arg validation/coercion ──────────────────────────────────────────────

export interface CreateChatAgentArgs {
  name: string;
  systemPrompt: string;
  model: string | null;
  enabled: boolean;
  welcomeMessage: string | null;
  config: ChatAgentConfig;
}

/** Core fields common to create/update, minus name/systemPrompt requiredness. */
function shapeAgentFields(
  rec: Record<string, unknown>,
): ArgResult<{ model: string | null; enabled: boolean; welcomeMessage: string | null; config: ChatAgentConfig }> {
  let model: string | null = null;
  if (rec.model !== undefined && rec.model !== null && rec.model !== "") {
    if (typeof rec.model !== "string") return { ok: false, error: "model must be a string (or omit it for the site default)" };
    model = rec.model.trim();
  }

  const enabled = rec.enabled === undefined ? true : rec.enabled === true;

  let welcomeMessage: string | null = null;
  if (rec.welcomeMessage !== undefined && rec.welcomeMessage !== null && rec.welcomeMessage !== "") {
    if (typeof rec.welcomeMessage !== "string") return { ok: false, error: "welcomeMessage must be a string" };
    welcomeMessage = rec.welcomeMessage;
  }

  const config = validateAgentConfigInput({
    limits: rec.limits,
    dataSources: rec.dataSources,
    collections: rec.collections,
  });
  if (!config.ok) return { ok: false, error: config.errors.join("; ") };

  return { ok: true, value: { model, enabled, welcomeMessage, config: config.value } };
}

export function validateCreateChatAgent(args: unknown): ArgResult<CreateChatAgentArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with name and systemPrompt" };

  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  if (!name) return { ok: false, error: "name is required (a unique agent name)" };
  const systemPrompt = typeof rec.systemPrompt === "string" ? rec.systemPrompt.trim() : "";
  if (!systemPrompt) return { ok: false, error: "systemPrompt is required (the bot's persona/instructions)" };

  const fields = shapeAgentFields(rec);
  if (!fields.ok) return fields;

  return { ok: true, value: { name, systemPrompt, ...fields.value } };
}

export interface UpdateChatAgentArgs {
  /** The id-or-name ref the caller supplied to address the agent. */
  ref: string;
  name: string;
  systemPrompt: string;
  model: string | null;
  enabled: boolean;
  welcomeMessage: string | null;
  config: ChatAgentConfig;
}

export function validateUpdateChatAgent(args: unknown): ArgResult<UpdateChatAgentArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with `agent` (id or name)" };

  const ref = typeof rec.agent === "string" ? rec.agent.trim() : "";
  if (!ref) return { ok: false, error: "agent (id or name) is required — list_chat_agents shows them" };

  // Full-replace: name + systemPrompt must still be present (the store row can't
  // hold an empty name/prompt), matching create's requiredness.
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  if (!name) return { ok: false, error: "name is required (pass the agent's full config on update)" };
  const systemPrompt = typeof rec.systemPrompt === "string" ? rec.systemPrompt.trim() : "";
  if (!systemPrompt) return { ok: false, error: "systemPrompt is required (pass the agent's full config on update)" };

  const fields = shapeAgentFields(rec);
  if (!fields.ok) return fields;

  return { ok: true, value: { ref, name, systemPrompt, ...fields.value } };
}

// ── Pure result formatting ────────────────────────────────────────────────────

/** Structural subset of the store's ChatAgentRow (this module stays store-free). */
type AgentRowLike = {
  id: string;
  name: string;
  enabled: boolean;
  model: string | null;
};

/**
 * One agent shaped for the model: identity + a limit SUMMARY + allowlisted tool
 * COUNTS — never the raw JSON columns. Takes the already-parsed config (the
 * handler parses it via the pure core) so this stays effect-free.
 */
export function formatAgentForModel(
  row: AgentRowLike,
  config: ChatAgentConfig,
): Record<string, unknown> {
  const updatableCollections = config.collections.filter((c) => c.canUpdate).length;
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    model: row.model,
    limits: {
      perIpPerMinute: config.limits.perIpPerMinute,
      perIpPerDay: config.limits.perIpPerDay,
      siteMessagesPerDay: config.limits.siteMessagesPerDay,
      maxMessagesPerConversation: config.limits.maxMessagesPerConversation,
      maxToolRounds: config.limits.maxToolRounds,
      maxTokensPerResponse: config.limits.maxTokensPerResponse,
    },
    dataSourceTools: config.dataSources.length,
    collectionTools: config.collections.length,
    updatableCollections,
  };
}
