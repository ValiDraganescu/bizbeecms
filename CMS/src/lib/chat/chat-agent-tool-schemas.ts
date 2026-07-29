/**
 * Tool SCHEMAS (OpenAI/Workers-AI function-calling shape) for the chat-agent
 * tools — split from `chat-agent-tools.ts` to keep both modules well under the
 * 1k-line ceiling. The arg validators + model formatters stay in
 * `chat-agent-tools.ts`; the patch types/appliers in `chat-agent-patch.ts`;
 * the CF-coupled handlers in `tool-dispatch-chat-agents.ts`. Defaults/ceilings
 * quoted in descriptions come from the pure core — never re-defined here.
 */
import { DEFAULT_LIMITS, LIMIT_CEILINGS } from "../public-chat/core.ts";

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
      "Update an existing chat agent, addressed by `agent` (its id OR name). " +
      "PATCH semantics on every top-level field: OMITTED = keep the stored " +
      "value; NULL = clear/reset to the default (model → the site default, " +
      "limits → all defaults, welcomeMessage → no greeting, " +
      "dataSources/collections → empty allowlist); a supplied value replaces. " +
      "A supplied dataSources/collections ARRAY replaces the stored list " +
      "WHOLESALE — to touch ONE entry use set_chat_agent_data_source / " +
      "set_chat_agent_collection; a supplied limits OBJECT replaces ALL limits " +
      "(its omitted keys fall back to defaults) — to patch single keys use " +
      "set_chat_agent_limits. welcomeMessage locale objects merge PER-LOCALE " +
      "(a null locale value removes that locale).",
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", description: "The target agent's id OR name (list_chat_agents shows both)." },
        ...AGENT_CORE_PROPERTIES,
        name: { type: "string", description: "New unique agent name (1–100 chars). Omit to keep the current name." },
        model: {
          type: ["string", "null"],
          description: "New model id; null resets to the site's default chat model; omit to keep.",
        },
        welcomeMessage: {
          type: ["string", "object", "null"],
          description:
            "Greeting patch: a plain string replaces the greeting; a locale " +
            "object like {\"fi\":\"Hei\"} merges PER-LOCALE (supplied locales " +
            "replace, omitted locales stay, a null value removes that locale); " +
            "null clears the whole greeting; omit to keep.",
        },
        limits: {
          ...LIMITS_SCHEMA,
          type: ["object", "null"],
          description:
            "Replaces ALL limits: omitted keys inside a supplied object fall " +
            "back to their defaults (patch single keys with set_chat_agent_limits " +
            "instead); null resets every limit to its default; omit to keep. " +
            LIMITS_SCHEMA.description,
        },
        dataSources: {
          ...DATA_SOURCES_SCHEMA,
          type: ["array", "null"],
          description:
            "REPLACES the stored allowlist wholesale (null or [] clears it; omit " +
            "to keep; one entry → set_chat_agent_data_source). " +
            DATA_SOURCES_SCHEMA.description,
        },
        collections: {
          ...COLLECTIONS_SCHEMA,
          type: ["array", "null"],
          description:
            "REPLACES the stored allowlist wholesale (null or [] clears it; omit " +
            "to keep; one entry → set_chat_agent_collection). " +
            COLLECTIONS_SCHEMA.description,
        },
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
            "Greeting patch: a plain string replaces the greeting; a locale " +
            "object like {\"fi\":\"Hei\"} merges PER-LOCALE (supplied locales " +
            "replace, omitted locales stay, a null value removes that locale); " +
            "null clears the whole greeting; omit to keep.",
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
      "omitted keys keep their stored value (unlike update_chat_agent, whose " +
      "supplied limits object replaces ALL limits). Keys (default → ceiling): " +
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
      "MERGE-PATCH ONE data-source tool on a chat agent's allowlist, matched by " +
      "`toolName`: when an entry with that toolName exists, ONLY the fields you " +
      "pass change (omitted = keep, null clears an optional field); no match ADDS " +
      "an entry — then sourceId, requestId and description are required. Every " +
      "OTHER allowlist entry is untouched — use this instead of update_chat_agent " +
      "to touch a single API tool. `sourceId` and `requestId` MUST reference an " +
      "EXISTING data source + saved request (list_data_sources shows the real " +
      "ids — never invent them).",
    parameters: {
      type: "object",
      properties: {
        ...AGENT_REF_PROP,
        toolName: { type: "string", description: "Short label for the guest tool (slugified into the bot's `ds_<slug>` tool name); the MATCH KEY — to rename, remove the entry and add a new one." },
        sourceId: { type: "string", description: "Existing data source id (from list_data_sources). Omit to keep the matched entry's source." },
        requestId: { type: "string", description: "Existing saved request id on that source (from list_data_sources). Omit to keep." },
        description: { type: "string", description: "What this tool does — the guest bot reads this to decide when to call it. Omit to keep." },
        maxCallsPerConversation: { type: ["number", "null"], description: "Per-conversation call cap for this tool. Omit to keep; null removes the cap." },
        requiredParams: {
          type: ["array", "null"],
          items: { type: "string" },
          description:
            "Request params the guest bot must always pass NON-EMPTY (\"\" is " +
            "rejected with a self-correcting error). Use to make an unbounded " +
            "call impossible — e.g. [\"from\",\"to\"] on a search tool. " +
            "Replaces the stored list wholesale; omit to keep; null removes the requirement.",
        },
      },
      required: ["agent", "toolName"],
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
      "MERGE-PATCH ONE collection entry on a chat agent's allowlist, matched by " +
      "`collection` (the content_<slug> table name): when an entry for that " +
      "table exists, ONLY the fields you pass change (omitted = keep, " +
      "`lookupFields: null` clears them); no match ADDS an entry — then " +
      "`description` is required. Every other entry is untouched. `canQuery` " +
      "reads PUBLISHED items only; `canCreate` lands new items as DRAFTS; " +
      "`canUpdate` (requires non-empty `lookupFields`) patches items and forces " +
      "them back to DRAFT. Discover real table names with query_collection.",
    parameters: {
      type: "object",
      properties: {
        ...AGENT_REF_PROP,
        collection: { type: "string", description: "The content_<slug> table name (from query_collection); the MATCH KEY." },
        description: { type: "string", description: "What the collection holds — the guest bot reads this. Omit to keep." },
        canQuery: { type: ["boolean", "null"], description: "Allow querying PUBLISHED items. Omit to keep (default false; null resets to false)." },
        canCreate: { type: ["boolean", "null"], description: "Allow creating items — they land as DRAFTS. Omit to keep (default false; null resets to false)." },
        canUpdate: { type: ["boolean", "null"], description: "Allow updating items (forced back to DRAFT). Requires lookupFields. Omit to keep (default false; null resets to false)." },
        lookupFields: {
          type: ["array", "null"],
          items: { type: "string" },
          description: "Exact-match field names that scope an update to one item. Required when canUpdate is true. Replaces wholesale; omit to keep; null clears them.",
        },
      },
      required: ["agent", "collection"],
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
