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
  formatAgentForModel,
  formatAgentDetailForModel,
} from "./chat-agent-tools";
import {
  mergeAgentPatch,
  applyLimitsPatch,
  applyDataSourceEntryPatch,
  applyCollectionEntryPatch,
  removeDataSourceEntry,
  removeCollectionEntry,
  type UpdateChatAgentPatch,
} from "./chat-agent-patch";
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
  const { ref, patch } = valid.value;
  try {
    const res = await persistAgentPatch(ref, patch);
    if (!res.ok) return res;
    return { ok: true, action: "updated", changed: Object.keys(patch), agent: res.agent };
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

// ── Chat-agent patches (update_chat_agent + every granular tool) ──────────────
// Shared skeleton: resolve the agent, parse its stored config, let the pure
// merge (chat-agent-patch.ts) produce the full row, persist via the ONE
// full-row store update (no forked write semantics).

/** Merge a patch onto the stored row and persist. Never throws. */
async function persistAgentPatch(
  ref: string,
  patch: UpdateChatAgentPatch,
): Promise<
  | { ok: true; agent: Record<string, unknown> }
  | { ok: false; errors: string[] }
> {
  const existing = await getChatAgent(ref);
  if (!existing) return { ok: false, errors: [await unknownAgentMessage(ref)] };
  const stored = parseAgentConfig(existing.limits, existing.dataSources, existing.collections);
  const merged = mergeAgentPatch(existing, stored, patch);
  const res = await updateChatAgent(existing.id, {
    ...merged.scalars,
    ...configColumns(merged.config),
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
    const res = await persistAgentPatch(ref, { limits });
    if (!res.ok) return res;
    return { ok: true, action: "updated", changed: Object.keys(patch), limits, agent: res.agent };
  } catch (err) {
    return { ok: false, errors: [`failed to set chat agent limits: ${(err as Error).message}`] };
  }
}

export async function handleSetChatAgentDataSource(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateSetChatAgentDataSource(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { ref, toolName } = valid.value;
  let patch = valid.value.patch;
  try {
    const existing = await getChatAgent(ref);
    if (!existing) return { ok: false, errors: [await unknownAgentMessage(ref)] };
    const config = parseAgentConfig(existing.limits, existing.dataSources, existing.collections);
    const current = config.dataSources.find((e) => e.toolName === toolName);
    // When the source/request pair is (re)supplied it must reference a REAL
    // source + saved request; accept id OR name refs and store the resolved
    // ids (self-correcting errors list what exists). A pure patch of other
    // fields keeps the already-validated stored ids.
    const sourceRef = patch.sourceId ?? current?.sourceId;
    const requestRef = patch.requestId ?? current?.requestId;
    if ((patch.sourceId !== undefined || patch.requestId !== undefined) && sourceRef && requestRef) {
      const resolved = await resolveSourceAndRequest(sourceRef, requestRef);
      if (!resolved.ok) return { ok: false, errors: [resolved.error] };
      patch = { ...patch, sourceId: resolved.source.id, requestId: resolved.request.id };
    }
    const applied = applyDataSourceEntryPatch(config.dataSources, toolName, patch);
    if (!applied.ok) return { ok: false, errors: [applied.error] };
    const res = await persistAgentPatch(ref, { dataSources: applied.value.list });
    if (!res.ok) return res;
    return { ok: true, action: applied.value.action, toolName, agent: res.agent };
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
    const res = await persistAgentPatch(ref, { dataSources: removed.list });
    if (!res.ok) return res;
    return { ok: true, action: "removed", toolName, agent: res.agent };
  } catch (err) {
    return { ok: false, errors: [`failed to remove chat agent data source: ${(err as Error).message}`] };
  }
}

export async function handleSetChatAgentCollection(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateSetChatAgentCollection(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { ref, collection, patch } = valid.value;
  try {
    // The entry must name a REAL collection table (self-correcting otherwise).
    const view = await getCollection(collection);
    if (!view) {
      return {
        ok: false,
        errors: [
          `no collection "${collection}" — discover the real content_<slug> table names with query_collection`,
        ],
      };
    }
    const existing = await getChatAgent(ref);
    if (!existing) return { ok: false, errors: [await unknownAgentMessage(ref)] };
    const config = parseAgentConfig(existing.limits, existing.dataSources, existing.collections);
    const applied = applyCollectionEntryPatch(config.collections, collection, patch);
    if (!applied.ok) return { ok: false, errors: [applied.error] };
    const res = await persistAgentPatch(ref, { collections: applied.value.list });
    if (!res.ok) return res;
    return { ok: true, action: applied.value.action, collection, agent: res.agent };
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
    const res = await persistAgentPatch(ref, { collections: removed.list });
    if (!res.ok) return res;
    return { ok: true, action: "removed", collection, agent: res.agent };
  } catch (err) {
    return { ok: false, errors: [`failed to remove chat agent collection: ${(err as Error).message}`] };
  }
}
