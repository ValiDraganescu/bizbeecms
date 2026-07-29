/**
 * mcp-full-crud-patch (Brief C) — PURE patch types + appliers for the chat-agent
 * mutating tools. The one contract, same as the data-source tools:
 *
 *   - omitted = keep the stored value
 *   - null    = clear / reset to the default where one exists
 *   - a supplied scalar replaces; a supplied array replaces WHOLESALE
 *   - welcomeMessage locale objects merge PER-LOCALE (null removes a locale)
 *   - set_chat_agent_data_source / set_chat_agent_collection MERGE onto the
 *     matched allowlist entry; no match still creates (full required set)
 *
 * Split out of `chat-agent-tools.ts` (schemas + arg validators stay there) to
 * keep both modules under the 1k-line ceiling. Dep-free relative `.ts` imports
 * only, so everything here runs under `node --test`. Every merged result
 * re-enters the SAME strict core validator the full write path uses — no
 * forked rules.
 */
import {
  validateAgentConfigInput,
  parseStoredWelcome,
  DEFAULT_LIMITS,
  type ChatAgentConfig,
  type ChatAgentLimits,
  type DataSourceAllowEntry,
  type CollectionAllowEntry,
} from "../public-chat/core.ts";

export type ArgResult<T> = { ok: true; value: T } | { ok: false; error: string };

// ── welcomeMessage patch (per-locale merge) ───────────────────────────────────

/**
 * A shaped welcomeMessage patch: a plain string REPLACES the greeting, `null`
 * CLEARS it, and a locale record merges PER-LOCALE (normalized codes; a null
 * value removes that locale, a string replaces it, omitted locales stay).
 */
export type WelcomeMessagePatch = string | null | Record<string, string | null>;

/**
 * Apply a shaped welcomeMessage patch onto the STORED column value (a plain
 * string or a JSON locale object). A stored plain string has no per-locale
 * base, so a locale-object patch replaces it outright. Returns the stored
 * form: a JSON string for locale objects, null for "no greeting".
 */
export function applyWelcomePatch(
  stored: string | null,
  patch: WelcomeMessagePatch,
): string | null {
  if (patch === null || typeof patch === "string") return patch;
  const base = stored === null ? null : parseStoredWelcome(stored);
  const merged: Record<string, string> =
    typeof base === "object" && base !== null ? { ...base } : {};
  for (const [code, value] of Object.entries(patch)) {
    if (value === null) delete merged[code];
    else merged[code] = value;
  }
  return Object.keys(merged).length === 0 ? null : JSON.stringify(merged);
}

// ── update_chat_agent / update_chat_agent_settings patches ────────────────────

/** Scalar-settings patch: which fields to change (omitted = keep stored). */
export interface AgentSettingsPatch {
  name?: string;
  systemPrompt?: string;
  /** null = reset to the site default model. */
  model?: string | null;
  enabled?: boolean;
  welcomeMessage?: WelcomeMessagePatch;
}

/**
 * The full update_chat_agent patch: the scalars plus the config sections.
 * Each supplied section replaces the stored one wholesale (validated by the
 * strict core; a null arg resolves to the section's default before it lands
 * here: limits → DEFAULT_LIMITS, allowlists → []).
 */
export interface UpdateChatAgentPatch extends AgentSettingsPatch {
  limits?: ChatAgentLimits;
  dataSources?: DataSourceAllowEntry[];
  collections?: CollectionAllowEntry[];
}

/** The stored scalar columns a patch merges onto (store-row structural subset). */
export interface StoredAgentScalars {
  name: string;
  systemPrompt: string;
  model: string | null;
  enabled: boolean;
  welcomeMessage: string | null;
}

/**
 * Merge a validated patch onto the stored row (scalars) + parsed config:
 * omitted fields keep the stored value, supplied ones replace (welcomeMessage
 * via its per-locale merge). Pure — the handler persists the result through
 * the one full-row store update.
 */
export function mergeAgentPatch(
  existing: StoredAgentScalars,
  config: ChatAgentConfig,
  patch: UpdateChatAgentPatch,
): { scalars: StoredAgentScalars; config: ChatAgentConfig } {
  return {
    scalars: {
      name: patch.name ?? existing.name,
      systemPrompt: patch.systemPrompt ?? existing.systemPrompt,
      model: patch.model !== undefined ? patch.model : existing.model,
      enabled: patch.enabled ?? existing.enabled,
      welcomeMessage:
        patch.welcomeMessage !== undefined
          ? applyWelcomePatch(existing.welcomeMessage, patch.welcomeMessage)
          : existing.welcomeMessage,
    },
    config: {
      limits: patch.limits ?? config.limits,
      dataSources: patch.dataSources ?? config.dataSources,
      collections: patch.collections ?? config.collections,
    },
  };
}

/** A limits patch: number = set, null = reset to default (omitted keys keep). */
export type LimitsPatch = Partial<Record<keyof ChatAgentLimits, number | null>>;

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

// ── Allowlist entry merge patches (set_chat_agent_data_source/_collection) ────

/**
 * Validate ONE merged allowlist entry via the SAME strict core validator the
 * full-config path uses (no forked rules); the `<kind>[0].` prefix is stripped
 * so errors speak in the tool's flat arg names.
 */
function validateOneEntry<T>(
  kind: "dataSources" | "collections",
  entry: unknown,
): ArgResult<T> {
  const config = validateAgentConfigInput({ [kind]: [entry] });
  if (!config.ok) {
    const prefix = new RegExp(`^${kind}\\[0\\][. ]?`);
    return { ok: false, error: config.errors.map((e) => e.replace(prefix, "")).join("; ") };
  }
  return { ok: true, value: config.value[kind][0] as T };
}

/**
 * A data-source allowlist entry patch (the entry is matched by toolName —
 * that's the key, not patchable). Omitted = keep; null clears an optional
 * field (maxCallsPerConversation, requiredParams).
 */
export interface DataSourceEntryPatch {
  sourceId?: string;
  requestId?: string;
  description?: string;
  maxCallsPerConversation?: number | null;
  requiredParams?: string[] | null;
}

const DS_ENTRY_REQUIRED = ["sourceId", "requestId", "description"] as const;
const DS_ENTRY_KEYS = [...DS_ENTRY_REQUIRED, "maxCallsPerConversation", "requiredParams"] as const;

/**
 * Merge a patch onto the allowlist entry matched by `toolName` (or build a new
 * entry when there's no match — then the full required set must be supplied)
 * and re-validate the RESULT with the strict core validator. Pure; the rest of
 * the list is untouched.
 */
export function applyDataSourceEntryPatch(
  list: readonly DataSourceAllowEntry[],
  toolName: string,
  patch: DataSourceEntryPatch,
): ArgResult<{ list: DataSourceAllowEntry[]; action: "added" | "updated" }> {
  const at = list.findIndex((e) => e.toolName === toolName);
  const existing = at === -1 ? null : list[at];
  if (!existing) {
    const missing = DS_ENTRY_REQUIRED.filter((k) => patch[k] === undefined);
    if (missing.length > 0) {
      return {
        ok: false,
        error:
          `no data-source tool "${toolName}" on this agent, so this call would ADD one — ` +
          `adding requires ${missing.join(", ")}. To patch an existing tool instead, pass its ` +
          `exact toolName (get_chat_agent shows them).`,
      };
    }
  } else if (DS_ENTRY_KEYS.every((k) => patch[k] === undefined)) {
    return {
      ok: false,
      error: `nothing to change on data-source tool "${toolName}" — pass at least one of ${DS_ENTRY_KEYS.join(", ")} (omitted fields keep their stored values)`,
    };
  }

  // null clears an optional field; omitted keeps the stored one (if any).
  const cap =
    patch.maxCallsPerConversation !== undefined
      ? patch.maxCallsPerConversation
      : existing?.maxCallsPerConversation;
  const required =
    patch.requiredParams !== undefined ? patch.requiredParams : existing?.requiredParams;
  const entry = validateOneEntry<DataSourceAllowEntry>("dataSources", {
    sourceId: patch.sourceId ?? existing?.sourceId,
    requestId: patch.requestId ?? existing?.requestId,
    toolName,
    description: patch.description ?? existing?.description,
    ...(cap != null ? { maxCallsPerConversation: cap } : {}),
    ...(required != null ? { requiredParams: required } : {}),
  });
  if (!entry.ok) return entry;
  const next = existing ? list.map((e, i) => (i === at ? entry.value : e)) : [...list, entry.value];
  return { ok: true, value: { list: next, action: existing ? "updated" : "added" } };
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

/**
 * A collection allowlist entry patch (matched by the `collection` table name —
 * the key, not patchable). Omitted = keep; `lookupFields: null` clears them
 * (rejected while canUpdate stays true — the core rule).
 */
export interface CollectionEntryPatch {
  description?: string;
  canQuery?: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  lookupFields?: string[] | null;
}

const COLLECTION_ENTRY_KEYS = [
  "description", "canQuery", "canCreate", "canUpdate", "lookupFields",
] as const;

/** Collection twin of applyDataSourceEntryPatch (create requires description). */
export function applyCollectionEntryPatch(
  list: readonly CollectionAllowEntry[],
  collection: string,
  patch: CollectionEntryPatch,
): ArgResult<{ list: CollectionAllowEntry[]; action: "added" | "updated" }> {
  const at = list.findIndex((e) => e.collection === collection);
  const existing = at === -1 ? null : list[at];
  if (!existing) {
    if (patch.description === undefined) {
      return {
        ok: false,
        error:
          `collection "${collection}" is not on this agent's allowlist, so this call would ADD ` +
          `it — adding requires description. To patch an existing entry instead, pass its exact ` +
          `content_<slug> table name (get_chat_agent shows them).`,
      };
    }
  } else if (COLLECTION_ENTRY_KEYS.every((k) => patch[k] === undefined)) {
    return {
      ok: false,
      error: `nothing to change on collection "${collection}" — pass at least one of ${COLLECTION_ENTRY_KEYS.join(", ")} (omitted fields keep their stored values)`,
    };
  }

  const lookupFields =
    patch.lookupFields !== undefined ? patch.lookupFields ?? [] : existing?.lookupFields;
  const entry = validateOneEntry<CollectionAllowEntry>("collections", {
    collection,
    description: patch.description ?? existing?.description,
    canQuery: patch.canQuery ?? existing?.canQuery,
    canCreate: patch.canCreate ?? existing?.canCreate,
    canUpdate: patch.canUpdate ?? existing?.canUpdate,
    ...(lookupFields !== undefined ? { lookupFields } : {}),
  });
  if (!entry.ok) return entry;
  const next = existing ? list.map((e, i) => (i === at ? entry.value : e)) : [...list, entry.value];
  return { ok: true, value: { list: next, action: existing ? "updated" : "added" } };
}
