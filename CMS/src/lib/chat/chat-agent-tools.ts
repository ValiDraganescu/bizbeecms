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
 *   - update_chat_agent  → patch an existing agent (addressed by id OR name)
 *                          under the one contract: omitted = keep stored,
 *                          null = clear/reset to default, a supplied array
 *                          replaces wholesale.
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
 *   - set_chat_agent_data_source   → MERGE-PATCH ONE dataSources allowlist entry
 *                                    (matched by toolName; no match adds it);
 *                                    the rest untouched.
 *   - remove_chat_agent_data_source→ remove ONE entry by toolName.
 *   - set_chat_agent_collection    → MERGE-PATCH ONE collections entry (matched
 *                                    by table name; no match adds it).
 *   - remove_chat_agent_collection → remove ONE entry by table name.
 *
 * Mirrors `data-source-tools.ts`: the PURE concerns (tool schemas + arg shaping +
 * response formatting) live here so they're unit-tested with dep-free
 * `node --test` (hence the relative `.ts` imports). The patch TYPES + APPLIERS
 * live in `chat-agent-patch.ts` (same purity, split for file size). The
 * CF-coupled work — store CRUD, JSON-column round-trip — is wired in
 * `tool-dispatch-chat-agents.ts`. The config shapes/defaults/ceilings + the
 * strict validator are owned by the pure core in `../public-chat/core.ts`;
 * this module never re-defines them.
 */
import {
  validateAgentConfigInput,
  validateWelcomeMessage,
  DEFAULT_LIMITS,
  LIMIT_CEILINGS,
  type ChatAgentConfig,
  type ChatAgentLimits,
} from "../public-chat/core.ts";
import { isValidLocaleCode, normalizeLocaleCode } from "../render/localize.ts";
import type {
  AgentSettingsPatch,
  UpdateChatAgentPatch,
  WelcomeMessagePatch,
  LimitsPatch,
  DataSourceEntryPatch,
  CollectionEntryPatch,
} from "./chat-agent-patch.ts";

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

/**
 * Shape an incoming welcomeMessage arg into a WelcomeMessagePatch: null clears,
 * a string replaces (validated/trimmed by the core), a locale object becomes a
 * normalized per-locale merge record (null value = remove that locale). All
 * key/value validation happens HERE so the applier is infallible.
 */
export function shapeWelcomePatch(raw: unknown): ArgResult<WelcomeMessagePatch> {
  if (raw === null) return { ok: true, value: null };
  if (typeof raw === "string") {
    const w = validateWelcomeMessage(raw);
    if (!w.ok) return w;
    return { ok: true, value: w.value };
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!isValidLocaleCode(k)) {
        return {
          ok: false,
          error: `welcomeMessage keys must be locale codes (like "en" or "pt-br") — "${k}" is not one`,
        };
      }
      if (v !== null && typeof v !== "string") {
        return {
          ok: false,
          error: `welcomeMessage.${k} must be a string (that locale's greeting), or null to remove the locale`,
        };
      }
      // An empty greeting means "no greeting for this locale" = removal.
      out[normalizeLocaleCode(k)] = v === null || v.trim() === "" ? null : v.trim();
    }
    return { ok: true, value: out };
  }
  return {
    ok: false,
    error:
      'welcomeMessage must be a string, a locale object like {"en":"Hello","fi":"Hei"} ' +
      "(merged per-locale; a null locale value removes it), or null to clear the greeting",
  };
}

/** Shared scalar-field shaping for update_chat_agent + update_chat_agent_settings. */
function shapeSettingsPatch(rec: Record<string, unknown>): ArgResult<AgentSettingsPatch> {
  const patch: AgentSettingsPatch = {};
  if (rec.name !== undefined) {
    if (typeof rec.name !== "string" || rec.name.trim() === "") {
      return { ok: false, error: "name cannot be cleared — an agent always has a name. Pass a new 1–100 char name, or omit `name` to keep the current one." };
    }
    patch.name = rec.name.trim();
  }
  if (rec.systemPrompt !== undefined) {
    if (typeof rec.systemPrompt !== "string" || rec.systemPrompt.trim() === "") {
      return { ok: false, error: "systemPrompt cannot be cleared — an agent always has a persona. Pass a new prompt, or omit `systemPrompt` to keep the current one." };
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
    if (rec.enabled !== null && typeof rec.enabled !== "boolean") {
      return { ok: false, error: "enabled must be true or false (or null to reset to the default, enabled)" };
    }
    patch.enabled = rec.enabled ?? true;
  }
  if (rec.welcomeMessage !== undefined) {
    const w = shapeWelcomePatch(rec.welcomeMessage);
    if (!w.ok) return w;
    patch.welcomeMessage = w.value;
  }
  return { ok: true, value: patch };
}

/**
 * update_chat_agent under the one contract: omitted = keep stored, null =
 * clear/reset to default, supplied = replace (arrays + the limits object
 * wholesale). Config sections are validated by the strict core HERE; merging
 * onto the stored row happens in `mergeAgentPatch` (chat-agent-patch.ts).
 */
export function validateUpdateChatAgent(
  args: unknown,
): ArgResult<{ ref: string; patch: UpdateChatAgentPatch }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with `agent` (id or name) plus the fields to change" };
  const ref = agentRef(rec);
  if (!ref.ok) return ref;

  const scalars = shapeSettingsPatch(rec);
  if (!scalars.ok) return scalars;
  const patch: UpdateChatAgentPatch = { ...scalars.value };

  // Each supplied config section replaces wholesale; null resolves to the
  // section's default (limits → all defaults, allowlists → empty) by handing
  // the strict core validator the same "not supplied" / empty input.
  if (rec.limits !== undefined) {
    const v = validateAgentConfigInput({ limits: rec.limits ?? undefined });
    if (!v.ok) return { ok: false, error: v.errors.join("; ") };
    patch.limits = v.value.limits;
  }
  if (rec.dataSources !== undefined) {
    const v = validateAgentConfigInput({ dataSources: rec.dataSources ?? [] });
    if (!v.ok) return { ok: false, error: v.errors.join("; ") };
    patch.dataSources = v.value.dataSources;
  }
  if (rec.collections !== undefined) {
    const v = validateAgentConfigInput({ collections: rec.collections ?? [] });
    if (!v.ok) return { ok: false, error: v.errors.join("; ") };
    patch.collections = v.value.collections;
  }

  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error:
        "nothing to change — pass at least one of name, systemPrompt, model, enabled, " +
        "welcomeMessage, limits, dataSources, collections (omitted fields keep their stored values)",
    };
  }
  return { ok: true, value: { ref: ref.value, patch } };
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

// ── Granular arg validation ───────────────────────────────────────────────────

function agentRef(rec: Record<string, unknown>): ArgResult<string> {
  const ref = typeof rec.agent === "string" ? rec.agent.trim() : "";
  if (!ref) return { ok: false, error: "agent (id or name) is required — list_chat_agents shows them" };
  return { ok: true, value: ref };
}

export function validateUpdateChatAgentSettings(
  args: unknown,
): ArgResult<{ ref: string; patch: AgentSettingsPatch }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with `agent` (id or name) and at least one setting" };
  const ref = agentRef(rec);
  if (!ref.ok) return ref;

  const shaped = shapeSettingsPatch(rec);
  if (!shaped.ok) return shaped;
  const patch = shaped.value;

  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error:
        "nothing to change — pass at least one of name, systemPrompt, model, enabled, welcomeMessage",
    };
  }
  return { ok: true, value: { ref: ref.value, patch } };
}

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
 * Shape the set_chat_agent_data_source args into a MERGE PATCH keyed by
 * toolName: omitted = keep the matched entry's value, null clears an optional
 * field. Field TYPES are checked here; the cross-field rules run in
 * `applyDataSourceEntryPatch` via the strict core, on the MERGED entry.
 */
export function validateSetChatAgentDataSource(
  args: unknown,
): ArgResult<{ ref: string; toolName: string; patch: DataSourceEntryPatch }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with agent and toolName plus the fields to change" };
  const ref = agentRef(rec);
  if (!ref.ok) return ref;
  const toolName = typeof rec.toolName === "string" ? rec.toolName.trim() : "";
  if (!toolName) {
    return { ok: false, error: "toolName is required — it is the match key: an existing entry with that toolName is PATCHED, otherwise one is ADDED (get_chat_agent shows the agent's tools)" };
  }

  const patch: DataSourceEntryPatch = {};
  for (const key of ["sourceId", "requestId", "description"] as const) {
    if (!(key in rec)) continue;
    if (typeof rec[key] !== "string" || (rec[key] as string).trim() === "") {
      return { ok: false, error: `${key} cannot be cleared — pass a new value, or omit \`${key}\` to keep the current one` };
    }
    patch[key] = (rec[key] as string).trim();
  }
  if ("maxCallsPerConversation" in rec) {
    if (rec.maxCallsPerConversation !== null && typeof rec.maxCallsPerConversation !== "number") {
      return { ok: false, error: "maxCallsPerConversation must be a positive integer, or null to remove the cap" };
    }
    patch.maxCallsPerConversation = rec.maxCallsPerConversation as number | null;
  }
  if ("requiredParams" in rec) {
    if (rec.requiredParams !== null && !Array.isArray(rec.requiredParams)) {
      return { ok: false, error: "requiredParams must be an array of param-name strings, or null to remove the requirement" };
    }
    patch.requiredParams = rec.requiredParams as string[] | null;
  }
  return { ok: true, value: { ref: ref.value, toolName, patch } };
}

/** Collection twin: a merge patch keyed by the `collection` table name. */
export function validateSetChatAgentCollection(
  args: unknown,
): ArgResult<{ ref: string; collection: string; patch: CollectionEntryPatch }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with agent and collection plus the fields to change" };
  const ref = agentRef(rec);
  if (!ref.ok) return ref;
  const collection = typeof rec.collection === "string" ? rec.collection.trim() : "";
  if (!collection) {
    return { ok: false, error: "collection is required — it is the match key: an existing entry for that content_<slug> table is PATCHED, otherwise one is ADDED (get_chat_agent shows the agent's entries)" };
  }

  const patch: CollectionEntryPatch = {};
  if ("description" in rec) {
    if (typeof rec.description !== "string" || rec.description.trim() === "") {
      return { ok: false, error: "description cannot be cleared — the guest bot reads it. Pass a new one, or omit `description` to keep the current one" };
    }
    patch.description = rec.description.trim();
  }
  for (const flag of ["canQuery", "canCreate", "canUpdate"] as const) {
    if (!(flag in rec)) continue;
    if (rec[flag] !== null && typeof rec[flag] !== "boolean") {
      return { ok: false, error: `${flag} must be true or false (or null to reset to false)` };
    }
    patch[flag] = (rec[flag] as boolean | null) ?? false;
  }
  if ("lookupFields" in rec) {
    if (rec.lookupFields !== null && !Array.isArray(rec.lookupFields)) {
      return { ok: false, error: "lookupFields must be an array of field-name strings, or null to clear them (rejected while canUpdate stays true)" };
    }
    patch.lookupFields = rec.lookupFields as string[] | null;
  }
  return { ok: true, value: { ref: ref.value, collection, patch } };
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

// The pure patch APPLIERS (mergeAgentPatch, applyLimitsPatch, the allowlist
// entry merge/remove appliers) live in `chat-agent-patch.ts`.
