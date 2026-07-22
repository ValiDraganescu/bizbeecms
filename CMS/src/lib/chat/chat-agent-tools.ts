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
 * Granular edit surface (preferred over full-replace for small changes — a big
 * re-send is where agents introduce config bugs):
 *   - get_chat_agent               → ONE agent's FULL config (incl. systemPrompt
 *                                    + the complete allowlists).
 *   - update_chat_agent_settings   → patch scalar fields only (name, prompt,
 *                                    model, enabled, welcome) — omitted = kept.
 *   - set_chat_agent_limits        → patch individual limit keys (null = reset
 *                                    to default; omitted = kept).
 *   - set_chat_agent_data_source   → upsert ONE dataSources allowlist entry
 *                                    (matched by toolName); the rest untouched.
 *   - remove_chat_agent_data_source→ remove ONE entry by toolName.
 *   - set_chat_agent_collection    → upsert ONE collections entry (matched by
 *                                    table name); the rest untouched.
 *   - remove_chat_agent_collection → remove ONE entry by table name.
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
  validateWelcomeMessage,
  DEFAULT_LIMITS,
  LIMIT_CEILINGS,
  type ChatAgentConfig,
  type ChatAgentLimits,
  type DataSourceAllowEntry,
  type CollectionAllowEntry,
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
      requiredParams: {
        type: "array",
        items: { type: "string" },
        description:
          "Request params the guest bot must always pass NON-EMPTY (the dispatcher " +
          "rejects \"\" for them with an error naming the params). Use to make an " +
          "unbounded call impossible — e.g. [\"from\",\"to\"] on a search tool.",
      },
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
  welcomeMessage: {
    type: ["string", "object"],
    description:
      "Optional greeting the widget shows before the visitor's first message. " +
      "A plain string, or a locale object {\"en\":\"Hello\",\"fi\":\"Hei\"} shown " +
      "per visitor content locale (list_locales shows the site's set).",
  },
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
      "FULL-REPLACE update of an existing chat agent, addressed by `agent` (its id " +
      "OR name) — a heavyweight tool for full reconfigurations ONLY. For anything " +
      "smaller, prefer the granular tools (update_chat_agent_settings, " +
      "set_chat_agent_limits, set_chat_agent_data_source, set_chat_agent_collection " +
      "and their remove_ counterparts): they change only what you pass and cannot " +
      "clobber the rest of the config. Here, every field you supply replaces the " +
      "stored value wholesale: pass the WHOLE config (e.g. the entire " +
      "dataSources/collections allowlist, not a delta) — omitted top-level fields " +
      "keep their stored value, but a supplied array REPLACES the stored one. Same " +
      "limit/allowlist shapes as create_chat_agent.",
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
    const w = validateWelcomeMessage(rec.welcomeMessage);
    if (!w.ok) return { ok: false, error: w.error };
    welcomeMessage = w.value;
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

/** Detail row shape (adds the prompt/welcome the summary deliberately omits). */
type AgentDetailRowLike = AgentRowLike & {
  systemPrompt: string;
  welcomeMessage: string | null;
};

/**
 * ONE agent's FULL config for the model (get_chat_agent): identity + prompt +
 * welcome + every limit + the complete allowlists. This is the read half the
 * granular edit tools rely on; the raw JSON columns still never leave the store.
 */
export function formatAgentDetailForModel(
  row: AgentDetailRowLike,
  config: ChatAgentConfig,
): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    model: row.model,
    welcomeMessage: row.welcomeMessage,
    systemPrompt: row.systemPrompt,
    limits: { ...config.limits },
    dataSources: config.dataSources.map((e) => ({ ...e })),
    collections: config.collections.map((e) => ({ ...e })),
  };
}

// ── Granular tool schemas ─────────────────────────────────────────────────────

const AGENT_REF_PROP = {
  agent: {
    type: "string",
    description: "The target agent's id OR name (list_chat_agents shows both).",
  },
} as const;

export const GET_CHAT_AGENT_TOOL = {
  type: "function" as const,
  function: {
    name: "get_chat_agent",
    description:
      "Read ONE chat agent's FULL config by `agent` (id OR name): systemPrompt, " +
      "welcome message, every usage limit, and the complete dataSources + " +
      "collections allowlists (list_chat_agents shows only counts). Call this " +
      "before a granular edit when the current config isn't already in your " +
      "context — never guess at stored entries.",
    parameters: {
      type: "object",
      properties: { ...AGENT_REF_PROP },
      required: ["agent"],
    },
  },
} as const;

export const UPDATE_CHAT_AGENT_SETTINGS_TOOL = {
  type: "function" as const,
  function: {
    name: "update_chat_agent_settings",
    description:
      "Patch a chat agent's SCALAR settings — name, systemPrompt, model, enabled, " +
      "welcomeMessage. Only the fields you pass change; everything else (limits, " +
      "allowlists, omitted fields) is untouched, so this is the safe way to e.g. " +
      "rewrite the persona or toggle the bot without re-sending the whole config. " +
      "Pass model: null to reset to the site default; welcomeMessage: null to clear it.",
    parameters: {
      type: "object",
      properties: {
        ...AGENT_REF_PROP,
        name: { type: "string", description: "New unique agent name (1–100 chars)." },
        systemPrompt: { type: "string", description: "New persona/instructions (replaces the stored prompt)." },
        model: {
          type: ["string", "null"],
          description: "New model id, or null to use the site's default chat model.",
        },
        enabled: { type: "boolean", description: "Whether the bot is live on published pages." },
        welcomeMessage: {
          type: ["string", "object", "null"],
          description:
            "New widget greeting — a plain string or a locale object " +
            "{\"en\":\"Hello\",\"fi\":\"Hei\"} shown per visitor content locale " +
            "— or null to clear it.",
        },
      },
      required: ["agent"],
    },
  },
} as const;

export const SET_CHAT_AGENT_LIMITS_TOOL = {
  type: "function" as const,
  function: {
    name: "set_chat_agent_limits",
    description:
      "Patch INDIVIDUAL usage limits on a chat agent. Only the keys you pass " +
      "change — pass a number to set a limit, null to reset it to its default; " +
      "omitted keys keep their stored value (unlike update_chat_agent, which " +
      "re-defaults omitted keys). Keys (default → ceiling): " +
      `perIpPerMinute (${DEFAULT_LIMITS.perIpPerMinute} → ${LIMIT_CEILINGS.perIpPerMinute}), ` +
      `perIpPerDay (${DEFAULT_LIMITS.perIpPerDay} → ${LIMIT_CEILINGS.perIpPerDay}), ` +
      `siteMessagesPerDay (${DEFAULT_LIMITS.siteMessagesPerDay} → ${LIMIT_CEILINGS.siteMessagesPerDay}), ` +
      `maxMessagesPerConversation (${DEFAULT_LIMITS.maxMessagesPerConversation} → ${LIMIT_CEILINGS.maxMessagesPerConversation}), ` +
      `maxUserMessageLen (${DEFAULT_LIMITS.maxUserMessageLen} → ${LIMIT_CEILINGS.maxUserMessageLen}), ` +
      `maxToolRounds (${DEFAULT_LIMITS.maxToolRounds} → ${LIMIT_CEILINGS.maxToolRounds}), ` +
      `maxTokensPerResponse (${DEFAULT_LIMITS.maxTokensPerResponse} → ${LIMIT_CEILINGS.maxTokensPerResponse}).`,
    parameters: {
      type: "object",
      properties: {
        ...AGENT_REF_PROP,
        limits: {
          type: "object",
          description:
            "The limit keys to change: number = set, null = reset to default, " +
            "omitted = keep the stored value. At least one key.",
          properties: {
            perIpPerMinute: { type: ["number", "null"] },
            perIpPerDay: { type: ["number", "null"] },
            siteMessagesPerDay: { type: ["number", "null"] },
            maxMessagesPerConversation: { type: ["number", "null"] },
            maxUserMessageLen: { type: ["number", "null"] },
            maxToolRounds: { type: ["number", "null"] },
            maxTokensPerResponse: { type: ["number", "null"] },
          },
        },
      },
      required: ["agent", "limits"],
    },
  },
} as const;

export const SET_CHAT_AGENT_DATA_SOURCE_TOOL = {
  type: "function" as const,
  function: {
    name: "set_chat_agent_data_source",
    description:
      "Add or replace ONE data-source tool on a chat agent's allowlist, matched " +
      "by `toolName` (an existing entry with that toolName is replaced; otherwise " +
      "the entry is added). Every OTHER allowlist entry is untouched — use this " +
      "instead of update_chat_agent to grant a single API tool. `sourceId` and " +
      "`requestId` MUST reference an EXISTING data source + saved request " +
      "(list_data_sources shows the real ids — never invent them).",
    parameters: {
      type: "object",
      properties: {
        ...AGENT_REF_PROP,
        sourceId: { type: "string", description: "Existing data source id (from list_data_sources)." },
        requestId: { type: "string", description: "Existing saved request id on that source (from list_data_sources)." },
        toolName: { type: "string", description: "Short label for the guest tool (slugified into the bot's `ds_<slug>` tool name); the upsert key." },
        description: { type: "string", description: "What this tool does — the guest bot reads this to decide when to call it." },
        maxCallsPerConversation: { type: "number", description: "Optional per-conversation call cap for this tool." },
        requiredParams: {
          type: "array",
          items: { type: "string" },
          description:
            "Request params the guest bot must always pass NON-EMPTY (\"\" is " +
            "rejected with a self-correcting error). Use to make an unbounded " +
            "call impossible — e.g. [\"from\",\"to\"] on a search tool.",
        },
      },
      required: ["agent", "sourceId", "requestId", "toolName", "description"],
    },
  },
} as const;

export const REMOVE_CHAT_AGENT_DATA_SOURCE_TOOL = {
  type: "function" as const,
  function: {
    name: "remove_chat_agent_data_source",
    description:
      "Remove ONE data-source tool from a chat agent's allowlist by its " +
      "`toolName`. Every other entry is untouched. An unknown toolName errors " +
      "and lists the agent's existing tool names.",
    parameters: {
      type: "object",
      properties: {
        ...AGENT_REF_PROP,
        toolName: { type: "string", description: "The allowlist entry's toolName (get_chat_agent shows them)." },
      },
      required: ["agent", "toolName"],
    },
  },
} as const;

export const SET_CHAT_AGENT_COLLECTION_TOOL = {
  type: "function" as const,
  function: {
    name: "set_chat_agent_collection",
    description:
      "Add or replace ONE collection entry on a chat agent's allowlist, matched " +
      "by `collection` (the content_<slug> table name — an existing entry for " +
      "that table is replaced; otherwise the entry is added). Every other entry " +
      "is untouched. `canQuery` reads PUBLISHED items only; `canCreate` lands new " +
      "items as DRAFTS; `canUpdate` (requires non-empty `lookupFields`) patches " +
      "items and forces them back to DRAFT. Discover real table names with " +
      "query_collection.",
    parameters: {
      type: "object",
      properties: {
        ...AGENT_REF_PROP,
        collection: { type: "string", description: "The content_<slug> table name (from query_collection); the upsert key." },
        description: { type: "string", description: "What the collection holds — the guest bot reads this." },
        canQuery: { type: "boolean", description: "Allow querying PUBLISHED items. Default false." },
        canCreate: { type: "boolean", description: "Allow creating items — they land as DRAFTS. Default false." },
        canUpdate: { type: "boolean", description: "Allow updating items (forced back to DRAFT). Requires lookupFields. Default false." },
        lookupFields: {
          type: "array",
          items: { type: "string" },
          description: "Exact-match field names that scope an update to one item. Required when canUpdate is true.",
        },
      },
      required: ["agent", "collection", "description"],
    },
  },
} as const;

export const REMOVE_CHAT_AGENT_COLLECTION_TOOL = {
  type: "function" as const,
  function: {
    name: "remove_chat_agent_collection",
    description:
      "Remove ONE collection entry from a chat agent's allowlist by its " +
      "`collection` table name. Every other entry is untouched. An unknown table " +
      "errors and lists the agent's allowlisted collections.",
    parameters: {
      type: "object",
      properties: {
        ...AGENT_REF_PROP,
        collection: { type: "string", description: "The allowlisted content_<slug> table name (get_chat_agent shows them)." },
      },
      required: ["agent", "collection"],
    },
  },
} as const;

// ── Granular arg validation ───────────────────────────────────────────────────

function agentRef(rec: Record<string, unknown>): ArgResult<string> {
  const ref = typeof rec.agent === "string" ? rec.agent.trim() : "";
  if (!ref) return { ok: false, error: "agent (id or name) is required — list_chat_agents shows them" };
  return { ok: true, value: ref };
}

/** Scalar-settings patch: which fields to change (omitted = keep stored). */
export interface AgentSettingsPatch {
  name?: string;
  systemPrompt?: string;
  /** null = reset to the site default model. */
  model?: string | null;
  enabled?: boolean;
  /** null = clear the greeting. */
  welcomeMessage?: string | null;
}

export function validateUpdateChatAgentSettings(
  args: unknown,
): ArgResult<{ ref: string; patch: AgentSettingsPatch }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with `agent` (id or name) and at least one setting" };
  const ref = agentRef(rec);
  if (!ref.ok) return ref;

  const patch: AgentSettingsPatch = {};
  if (rec.name !== undefined) {
    if (typeof rec.name !== "string" || rec.name.trim() === "") {
      return { ok: false, error: "name must be a non-empty string (omit it to keep the current name)" };
    }
    patch.name = rec.name.trim();
  }
  if (rec.systemPrompt !== undefined) {
    if (typeof rec.systemPrompt !== "string" || rec.systemPrompt.trim() === "") {
      return { ok: false, error: "systemPrompt must be a non-empty string (omit it to keep the current prompt)" };
    }
    patch.systemPrompt = rec.systemPrompt.trim();
  }
  if (rec.model !== undefined) {
    if (rec.model !== null && typeof rec.model !== "string") {
      return { ok: false, error: "model must be a model-id string, or null for the site default" };
    }
    patch.model = rec.model === null || rec.model.trim() === "" ? null : rec.model.trim();
  }
  if (rec.enabled !== undefined) {
    if (typeof rec.enabled !== "boolean") {
      return { ok: false, error: "enabled must be true or false" };
    }
    patch.enabled = rec.enabled;
  }
  if (rec.welcomeMessage !== undefined) {
    const w = validateWelcomeMessage(rec.welcomeMessage);
    if (!w.ok) return { ok: false, error: `${w.error} — or null to clear it` };
    patch.welcomeMessage = w.value;
  }

  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error:
        "nothing to change — pass at least one of name, systemPrompt, model, enabled, welcomeMessage",
    };
  }
  return { ok: true, value: { ref: ref.value, patch } };
}

/** A limits patch: number = set, null = reset to default (omitted keys keep). */
export type LimitsPatch = Partial<Record<keyof ChatAgentLimits, number | null>>;

const LIMIT_PATCH_KEYS = Object.keys(DEFAULT_LIMITS) as (keyof ChatAgentLimits)[];

export function validateSetChatAgentLimits(
  args: unknown,
): ArgResult<{ ref: string; patch: LimitsPatch }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with `agent` and `limits`" };
  const ref = agentRef(rec);
  if (!ref.ok) return ref;

  const raw = asRecord(rec.limits);
  if (!raw) {
    return {
      ok: false,
      error: `limits must be an object of limit key → number (or null to reset). Keys: ${LIMIT_PATCH_KEYS.join(", ")}`,
    };
  }
  const patch: LimitsPatch = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!(LIMIT_PATCH_KEYS as string[]).includes(key)) {
      return {
        ok: false,
        error: `unknown limit "${key}" — valid keys: ${LIMIT_PATCH_KEYS.join(", ")}`,
      };
    }
    const k = key as keyof ChatAgentLimits;
    if (value === null) {
      patch[k] = null;
      continue;
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > LIMIT_CEILINGS[k]) {
      return {
        ok: false,
        error:
          `limits.${k} must be a whole number in [1, ${LIMIT_CEILINGS[k]}] ` +
          `(default ${DEFAULT_LIMITS[k]}), or null to reset — got ${JSON.stringify(value)}`,
      };
    }
    patch[k] = value;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: `limits is empty — pass at least one of: ${LIMIT_PATCH_KEYS.join(", ")}` };
  }
  return { ok: true, value: { ref: ref.value, patch } };
}

/**
 * Validate ONE data-source allowlist entry via the SAME strict core validator
 * the full-config path uses (no forked rules); the `dataSources[0].` prefix is
 * stripped so errors speak in this tool's flat arg names.
 */
export function validateSetChatAgentDataSource(
  args: unknown,
): ArgResult<{ ref: string; entry: DataSourceAllowEntry }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with agent, sourceId, requestId, toolName, description" };
  const ref = agentRef(rec);
  if (!ref.ok) return ref;

  const entry = {
    sourceId: rec.sourceId,
    requestId: rec.requestId,
    toolName: rec.toolName,
    description: rec.description,
    ...(rec.maxCallsPerConversation !== undefined
      ? { maxCallsPerConversation: rec.maxCallsPerConversation }
      : {}),
    ...(rec.requiredParams !== undefined ? { requiredParams: rec.requiredParams } : {}),
  };
  const config = validateAgentConfigInput({ dataSources: [entry] });
  if (!config.ok) {
    return {
      ok: false,
      error: config.errors.map((e) => e.replace(/^dataSources\[0\]\./, "").replace(/^dataSources\[0\] /, "")).join("; "),
    };
  }
  return { ok: true, value: { ref: ref.value, entry: config.value.dataSources[0] } };
}

/** Validate ONE collection allowlist entry (same shared-core strategy). */
export function validateSetChatAgentCollection(
  args: unknown,
): ArgResult<{ ref: string; entry: CollectionAllowEntry }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with agent, collection, description" };
  const ref = agentRef(rec);
  if (!ref.ok) return ref;

  const entry = {
    collection: rec.collection,
    description: rec.description,
    ...(rec.canQuery !== undefined ? { canQuery: rec.canQuery } : {}),
    ...(rec.canCreate !== undefined ? { canCreate: rec.canCreate } : {}),
    ...(rec.canUpdate !== undefined ? { canUpdate: rec.canUpdate } : {}),
    ...(rec.lookupFields !== undefined ? { lookupFields: rec.lookupFields } : {}),
  };
  const config = validateAgentConfigInput({ collections: [entry] });
  if (!config.ok) {
    return {
      ok: false,
      error: config.errors.map((e) => e.replace(/^collections\[0\]\./, "").replace(/^collections\[0\] /, "")).join("; "),
    };
  }
  return { ok: true, value: { ref: ref.value, entry: config.value.collections[0] } };
}

export function validateRemoveKey(
  args: unknown,
  key: "toolName" | "collection",
): ArgResult<{ ref: string; value: string }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: `expected an object with agent and ${key}` };
  const ref = agentRef(rec);
  if (!ref.ok) return ref;
  const value = typeof rec[key] === "string" ? (rec[key] as string).trim() : "";
  if (!value) return { ok: false, error: `${key} is required (get_chat_agent shows the agent's entries)` };
  return { ok: true, value: { ref: ref.value, value } };
}

// ── Pure config-patch appliers ────────────────────────────────────────────────
// Each takes the PARSED stored config and returns a new one; the handler
// re-persists via the same full-row store update the full-replace path uses.

/** Merge a limits patch onto the stored limits (null resets to the default). */
export function applyLimitsPatch(
  current: ChatAgentLimits,
  patch: LimitsPatch,
): ChatAgentLimits {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const k = key as keyof ChatAgentLimits;
    next[k] = value === null ? DEFAULT_LIMITS[k] : (value as number);
  }
  return next;
}

/** Upsert one data-source entry by toolName. Reports whether it added or replaced. */
export function upsertDataSourceEntry(
  list: readonly DataSourceAllowEntry[],
  entry: DataSourceAllowEntry,
): { list: DataSourceAllowEntry[]; action: "added" | "replaced" } {
  const at = list.findIndex((e) => e.toolName === entry.toolName);
  if (at === -1) return { list: [...list, entry], action: "added" };
  const next = [...list];
  next[at] = entry;
  return { list: next, action: "replaced" };
}

/** Remove one data-source entry by toolName; unknown names get a listing error. */
export function removeDataSourceEntry(
  list: readonly DataSourceAllowEntry[],
  toolName: string,
): { ok: true; list: DataSourceAllowEntry[] } | { ok: false; error: string } {
  const next = list.filter((e) => e.toolName !== toolName);
  if (next.length === list.length) {
    const names = list.map((e) => `"${e.toolName}"`);
    return {
      ok: false,
      error:
        names.length === 0
          ? `no data-source tool "${toolName}" — this agent's allowlist is empty`
          : `no data-source tool "${toolName}" — this agent's tools: ${names.join(", ")}`,
    };
  }
  return { ok: true, list: next };
}

/** Upsert one collection entry by table name. Reports added vs replaced. */
export function upsertCollectionEntry(
  list: readonly CollectionAllowEntry[],
  entry: CollectionAllowEntry,
): { list: CollectionAllowEntry[]; action: "added" | "replaced" } {
  const at = list.findIndex((e) => e.collection === entry.collection);
  if (at === -1) return { list: [...list, entry], action: "added" };
  const next = [...list];
  next[at] = entry;
  return { list: next, action: "replaced" };
}

/** Remove one collection entry by table name; unknown tables get a listing error. */
export function removeCollectionEntry(
  list: readonly CollectionAllowEntry[],
  collection: string,
): { ok: true; list: CollectionAllowEntry[] } | { ok: false; error: string } {
  const next = list.filter((e) => e.collection !== collection);
  if (next.length === list.length) {
    const names = list.map((e) => `"${e.collection}"`);
    return {
      ok: false,
      error:
        names.length === 0
          ? `collection "${collection}" is not on this agent's allowlist — the allowlist is empty`
          : `collection "${collection}" is not on this agent's allowlist — allowlisted: ${names.join(", ")}`,
    };
  }
  return { ok: true, list: next };
}
