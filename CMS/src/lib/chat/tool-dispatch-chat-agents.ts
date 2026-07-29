/**
 * Guest-chat-agent tool handlers (split from `tool-dispatch.ts`): agent CRUD +
 * granular settings/limits/allowlist patches. Registered in the shared
 * HANDLERS map in `tool-dispatch.ts`.
 *
 * public-guest-chatbots (Slice 6): pure validation in chat-agent-tools.ts
 * (schemas + arg shaping + the model DTO); the config validator itself lives in
 * the pure public-chat core. The store keeps the limits/dataSources/collections
 * columns as RAW JSON strings, so a handler stringifies the validated config in,
 * and parseAgentConfig's out for the summary. Admins configure the agent here;
 * the guest bot only ever gets the allowlisted tools (a separate, locked-down
 * public path — never this registry).
 */
import {
  validateCreateChatAgent,
  validateUpdateChatAgent,
  validateUpdateChatAgentSettings,
  validateSetChatAgentLimits,
  validateSetChatAgentDataSource,
  validateSetChatAgentCollection,
  validateRemoveKey,
  applyLimitsPatch,
  upsertDataSourceEntry,
  removeDataSourceEntry,
  upsertCollectionEntry,
  removeCollectionEntry,
  formatAgentForModel,
  formatAgentDetailForModel,
} from "./chat-agent-tools";
import { coerceIdArg } from "./read-tools";
import {
  listChatAgents,
  getChatAgent,
  createChatAgent,
  updateChatAgent,
  deleteChatAgent,
} from "@/db/chat-agent-store";
import { parseAgentConfig } from "@/lib/public-chat/core";
import { getCollection } from "@/db/collection-store";
import { resolveSourceAndRequest } from "./tool-dispatch-shared";

/** Stringify a validated config into the three JSON columns the store expects. */
function configColumns(config: {
  limits: unknown;
  dataSources: unknown;
  collections: unknown;
}): { limits: string; dataSources: string; collections: string } {
  return {
    limits: JSON.stringify(config.limits),
    dataSources: JSON.stringify(config.dataSources),
    collections: JSON.stringify(config.collections),
  };
}

/** Shape a stored row for the model: identity + limit summary + allowlist counts. */
function summarizeAgent(row: {
  id: string;
  name: string;
  enabled: boolean;
  model: string | null;
  limits: string;
  dataSources: string;
  collections: string;
}): Record<string, unknown> {
  const config = parseAgentConfig(row.limits, row.dataSources, row.collections);
  return formatAgentForModel(row, config);
}

/** "no such agent" error listing the existing agent names (AI error philosophy). */
async function unknownAgentMessage(ref: string): Promise<string> {
  const names = (await listChatAgents()).map((a) => a.name);
  if (names.length === 0) {
    return `no chat agent "${ref}" — this site has no chat agents yet (create one with create_chat_agent).`;
  }
  return `no chat agent "${ref}". Existing agents (id or name): ${names.join(", ")}.`;
}

export async function handleListChatAgents(): Promise<Record<string, unknown>> {
  try {
    const rows = await listChatAgents();
    return { ok: true, agents: rows.map(summarizeAgent) };
  } catch (err) {
    return { ok: false, errors: [`failed to list chat agents: ${(err as Error).message}`] };
  }
}

export async function handleCreateChatAgent(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreateChatAgent(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const v = valid.value;
  try {
    const res = await createChatAgent({
      name: v.name,
      systemPrompt: v.systemPrompt,
      model: v.model,
      enabled: v.enabled,
      welcomeMessage: v.welcomeMessage,
      ...configColumns(v.config),
    });
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "created", agent: summarizeAgent(res.agent) };
  } catch (err) {
    return { ok: false, errors: [`failed to create chat agent: ${(err as Error).message}`] };
  }
}

export async function handleUpdateChatAgent(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateUpdateChatAgent(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const v = valid.value;
  try {
    const existing = await getChatAgent(v.ref);
    if (!existing) return { ok: false, errors: [await unknownAgentMessage(v.ref)] };
    const res = await updateChatAgent(existing.id, {
      name: v.name,
      systemPrompt: v.systemPrompt,
      model: v.model,
      enabled: v.enabled,
      welcomeMessage: v.welcomeMessage,
      ...configColumns(v.config),
    });
    if (res === null) return { ok: false, errors: [await unknownAgentMessage(v.ref)] };
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "updated", agent: summarizeAgent(res.agent) };
  } catch (err) {
    return { ok: false, errors: [`failed to update chat agent: ${(err as Error).message}`] };
  }
}

export async function handleDeleteChatAgent(args: unknown): Promise<Record<string, unknown>> {
  const ref = coerceIdArg(args, "agent");
  if (!ref) return { ok: false, errors: ["agent (id or name) is required — list_chat_agents shows them"] };
  try {
    const existing = await getChatAgent(ref);
    if (!existing) return { ok: false, errors: [await unknownAgentMessage(ref)] };
    const deleted = await deleteChatAgent(existing.id);
    if (!deleted) return { ok: false, errors: [await unknownAgentMessage(ref)] };
    return { ok: true, action: "deleted", agent: existing.name };
  } catch (err) {
    return { ok: false, errors: [`failed to delete chat agent: ${(err as Error).message}`] };
  }
}

export async function handleGetChatAgent(args: unknown): Promise<Record<string, unknown>> {
  const ref = coerceIdArg(args, "agent");
  if (!ref) return { ok: false, errors: ["agent (id or name) is required — list_chat_agents shows them"] };
  try {
    const row = await getChatAgent(ref);
    if (!row) return { ok: false, errors: [await unknownAgentMessage(ref)] };
    const config = parseAgentConfig(row.limits, row.dataSources, row.collections);
    return { ok: true, agent: formatAgentDetailForModel(row, config) };
  } catch (err) {
    return { ok: false, errors: [`failed to read chat agent: ${(err as Error).message}`] };
  }
}

// ── Granular chat-agent patches ───────────────────────────────────────────────
// Shared skeleton: resolve the agent, parse its stored config, let the pure
// applier produce the DELTA'd row fields, persist via the same full-row store
// update the full-replace path uses (one write path, no forked semantics).

type AgentPatch = {
  name?: string;
  systemPrompt?: string;
  model?: string | null;
  enabled?: boolean;
  welcomeMessage?: string | null;
  config?: { limits: unknown; dataSources: unknown; collections: unknown };
};

/** Apply a patch on top of an existing row and persist. Never throws. */
async function persistAgentPatch(
  ref: string,
  patch: AgentPatch,
): Promise<
  | { ok: true; agent: Record<string, unknown> }
  | { ok: false; errors: string[] }
> {
  const existing = await getChatAgent(ref);
  if (!existing) return { ok: false, errors: [await unknownAgentMessage(ref)] };
  const config =
    patch.config ??
    parseAgentConfig(existing.limits, existing.dataSources, existing.collections);
  const res = await updateChatAgent(existing.id, {
    name: patch.name ?? existing.name,
    systemPrompt: patch.systemPrompt ?? existing.systemPrompt,
    model: patch.model !== undefined ? patch.model : existing.model,
    enabled: patch.enabled ?? existing.enabled,
    welcomeMessage:
      patch.welcomeMessage !== undefined ? patch.welcomeMessage : existing.welcomeMessage,
    ...configColumns(config),
  });
  if (res === null) return { ok: false, errors: [await unknownAgentMessage(ref)] };
  if (!res.ok) return { ok: false, errors: [res.error] };
  return { ok: true, agent: summarizeAgent(res.agent) };
}

export async function handleUpdateChatAgentSettings(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateUpdateChatAgentSettings(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { ref, patch } = valid.value;
  try {
    const res = await persistAgentPatch(ref, patch);
    if (!res.ok) return res;
    return { ok: true, action: "updated", changed: Object.keys(patch), agent: res.agent };
  } catch (err) {
    return { ok: false, errors: [`failed to update chat agent settings: ${(err as Error).message}`] };
  }
}

export async function handleSetChatAgentLimits(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateSetChatAgentLimits(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { ref, patch } = valid.value;
  try {
    const existing = await getChatAgent(ref);
    if (!existing) return { ok: false, errors: [await unknownAgentMessage(ref)] };
    const config = parseAgentConfig(existing.limits, existing.dataSources, existing.collections);
    const limits = applyLimitsPatch(config.limits, patch);
    const res = await persistAgentPatch(ref, { config: { ...config, limits } });
    if (!res.ok) return res;
    return { ok: true, action: "updated", changed: Object.keys(patch), limits, agent: res.agent };
  } catch (err) {
    return { ok: false, errors: [`failed to set chat agent limits: ${(err as Error).message}`] };
  }
}

export async function handleSetChatAgentDataSource(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateSetChatAgentDataSource(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { ref, entry } = valid.value;
  try {
    // The entry must reference a REAL source + saved request; accept id OR name
    // refs and store the resolved ids (self-correcting errors list what exists).
    const resolved = await resolveSourceAndRequest(entry.sourceId, entry.requestId);
    if (!resolved.ok) return { ok: false, errors: [resolved.error] };
    entry.sourceId = resolved.source.id;
    entry.requestId = resolved.request.id;
    const existing = await getChatAgent(ref);
    if (!existing) return { ok: false, errors: [await unknownAgentMessage(ref)] };
    const config = parseAgentConfig(existing.limits, existing.dataSources, existing.collections);
    const { list, action } = upsertDataSourceEntry(config.dataSources, entry);
    const res = await persistAgentPatch(ref, { config: { ...config, dataSources: list } });
    if (!res.ok) return res;
    return { ok: true, action, toolName: entry.toolName, agent: res.agent };
  } catch (err) {
    return { ok: false, errors: [`failed to set chat agent data source: ${(err as Error).message}`] };
  }
}

export async function handleRemoveChatAgentDataSource(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateRemoveKey(args, "toolName");
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { ref, value: toolName } = valid.value;
  try {
    const existing = await getChatAgent(ref);
    if (!existing) return { ok: false, errors: [await unknownAgentMessage(ref)] };
    const config = parseAgentConfig(existing.limits, existing.dataSources, existing.collections);
    const removed = removeDataSourceEntry(config.dataSources, toolName);
    if (!removed.ok) return { ok: false, errors: [removed.error] };
    const res = await persistAgentPatch(ref, { config: { ...config, dataSources: removed.list } });
    if (!res.ok) return res;
    return { ok: true, action: "removed", toolName, agent: res.agent };
  } catch (err) {
    return { ok: false, errors: [`failed to remove chat agent data source: ${(err as Error).message}`] };
  }
}

export async function handleSetChatAgentCollection(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateSetChatAgentCollection(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { ref, entry } = valid.value;
  try {
    // The entry must name a REAL collection table (self-correcting otherwise).
    const view = await getCollection(entry.collection);
    if (!view) {
      return {
        ok: false,
        errors: [
          `no collection "${entry.collection}" — discover the real content_<slug> table names with query_collection`,
        ],
      };
    }
    const existing = await getChatAgent(ref);
    if (!existing) return { ok: false, errors: [await unknownAgentMessage(ref)] };
    const config = parseAgentConfig(existing.limits, existing.dataSources, existing.collections);
    const { list, action } = upsertCollectionEntry(config.collections, entry);
    const res = await persistAgentPatch(ref, { config: { ...config, collections: list } });
    if (!res.ok) return res;
    return { ok: true, action, collection: entry.collection, agent: res.agent };
  } catch (err) {
    return { ok: false, errors: [`failed to set chat agent collection: ${(err as Error).message}`] };
  }
}

export async function handleRemoveChatAgentCollection(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateRemoveKey(args, "collection");
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { ref, value: collection } = valid.value;
  try {
    const existing = await getChatAgent(ref);
    if (!existing) return { ok: false, errors: [await unknownAgentMessage(ref)] };
    const config = parseAgentConfig(existing.limits, existing.dataSources, existing.collections);
    const removed = removeCollectionEntry(config.collections, collection);
    if (!removed.ok) return { ok: false, errors: [removed.error] };
    const res = await persistAgentPatch(ref, { config: { ...config, collections: removed.list } });
    if (!res.ok) return res;
    return { ok: true, action: "removed", collection, agent: res.agent };
  } catch (err) {
    return { ok: false, errors: [`failed to remove chat agent collection: ${(err as Error).message}`] };
  }
}
