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
 * Mirrors `data-source-tools.ts`: the PURE concerns (arg shaping + response
 * formatting) live here so they're unit-tested with dep-free `node --test`
 * (hence the relative `.ts` imports). The tool SCHEMAS live in
 * `chat-agent-tool-schemas.ts` and the patch TYPES + APPLIERS in
 * `chat-agent-patch.ts` (same purity, split for file size). The CF-coupled
 * work — store CRUD, JSON-column round-trip — is wired in
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
import { asRecord, type ArgResult } from "./tool-args.ts";

export type { ArgResult };

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
