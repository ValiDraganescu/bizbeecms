/**
 * public-guest-chatbots Slice 1 — CRUD store for `chat_agent` (per-Site D1).
 *
 * The JSON columns (`limits`, `dataSources`, `collections`) stay RAW STRINGS
 * here on purpose: this store never encodes config semantics. Callers parse and
 * validate them via the pure, dep-free core in `src/lib/public-chat/core.ts`,
 * which owns the shapes and the defaults. `ChatAgentRow` is the flat row shape
 * those callers receive.
 *
 * Reads D1 ONLY via the `Db` port (`getDb()`), never `env.DB` (sole-reader
 * guard); `injectedDb` keeps it node-testable (data-source-store pattern).
 */
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";

/**
 * A chat agent as stored. The JSON columns are RAW STRINGS — the pure core
 * parses/validates them; the DB layer keeps them opaque.
 */
export type ChatAgentRow = {
  id: string;
  name: string;
  systemPrompt: string;
  model: string | null;
  enabled: boolean;
  welcomeMessage: string | null;
  limits: string;
  dataSources: string;
  collections: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Fields an operator (or the admin AI) may set on create/update. */
export type ChatAgentInput = {
  name: string;
  systemPrompt: string;
  model: string | null;
  enabled: boolean;
  welcomeMessage: string | null;
  limits: string;
  dataSources: string;
  collections: string;
};

function toRow(row: typeof schema.chatAgent.$inferSelect): ChatAgentRow {
  return {
    id: row.id,
    name: row.name,
    systemPrompt: row.systemPrompt,
    model: row.model,
    enabled: row.enabled,
    welcomeMessage: row.welcomeMessage,
    limits: row.limits,
    dataSources: row.dataSources,
    collections: row.collections,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listChatAgents(injectedDb?: Db): Promise<ChatAgentRow[]> {
  const db = injectedDb ?? (await getDb());
  const rows = await db.select().from(schema.chatAgent);
  return rows.map(toRow);
}

/**
 * Resolve an agent by id first, then by its unique name — the GuestChat block's
 * `agent` prop may reference either. Returns null when neither matches.
 */
export async function getChatAgent(
  idOrName: string,
  injectedDb?: Db,
): Promise<ChatAgentRow | null> {
  const db = injectedDb ?? (await getDb());
  const byId = await db
    .select()
    .from(schema.chatAgent)
    .where(eq(schema.chatAgent.id, idOrName))
    .limit(1);
  if (byId[0]) return toRow(byId[0]);
  const byName = await db
    .select()
    .from(schema.chatAgent)
    .where(eq(schema.chatAgent.name, idOrName))
    .limit(1);
  return byName[0] ? toRow(byName[0]) : null;
}

/**
 * Create an agent. Name uniqueness is checked up front and reported as
 * `{ ok: false, error }` rather than thrown, so routes/tools can surface a
 * clean message instead of a 500 on the unique-index violation.
 */
export async function createChatAgent(
  input: ChatAgentInput,
  injectedDb?: Db,
): Promise<{ ok: true; agent: ChatAgentRow } | { ok: false; error: string }> {
  const db = injectedDb ?? (await getDb());
  const clash = await db
    .select({ id: schema.chatAgent.id })
    .from(schema.chatAgent)
    .where(eq(schema.chatAgent.name, input.name))
    .limit(1);
  if (clash[0]) {
    return { ok: false, error: `A chat agent named "${input.name}" already exists.` };
  }
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    name: input.name,
    systemPrompt: input.systemPrompt,
    model: input.model,
    enabled: input.enabled,
    welcomeMessage: input.welcomeMessage,
    limits: input.limits,
    dataSources: input.dataSources,
    collections: input.collections,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.chatAgent).values(row);
  return { ok: true, agent: toRow(row) };
}

/**
 * Full-replace patch of the provided fields (same semantics as the data-source
 * update tool: the caller sends the whole config, not a delta). Bumps
 * `updatedAt`. Returns null when the id is unknown, or `{ ok: false }` when the
 * new name collides with a DIFFERENT agent.
 */
export async function updateChatAgent(
  id: string,
  patch: ChatAgentInput,
  injectedDb?: Db,
): Promise<
  | { ok: true; agent: ChatAgentRow }
  | { ok: false; error: string }
  | null
> {
  const db = injectedDb ?? (await getDb());
  const existing = await db
    .select()
    .from(schema.chatAgent)
    .where(eq(schema.chatAgent.id, id))
    .limit(1);
  if (!existing[0]) return null;

  const clash = await db
    .select({ id: schema.chatAgent.id })
    .from(schema.chatAgent)
    .where(eq(schema.chatAgent.name, patch.name))
    .limit(1);
  if (clash[0] && clash[0].id !== id) {
    return { ok: false, error: `A chat agent named "${patch.name}" already exists.` };
  }

  const updated = {
    ...existing[0],
    name: patch.name,
    systemPrompt: patch.systemPrompt,
    model: patch.model,
    enabled: patch.enabled,
    welcomeMessage: patch.welcomeMessage,
    limits: patch.limits,
    dataSources: patch.dataSources,
    collections: patch.collections,
    updatedAt: new Date(),
  };
  await db
    .update(schema.chatAgent)
    .set({
      name: updated.name,
      systemPrompt: updated.systemPrompt,
      model: updated.model,
      enabled: updated.enabled,
      welcomeMessage: updated.welcomeMessage,
      limits: updated.limits,
      dataSources: updated.dataSources,
      collections: updated.collections,
      updatedAt: updated.updatedAt,
    })
    .where(eq(schema.chatAgent.id, id));
  return { ok: true, agent: toRow(updated) };
}

/** Delete an agent by id. Returns false when not found. */
export async function deleteChatAgent(id: string, injectedDb?: Db): Promise<boolean> {
  const db = injectedDb ?? (await getDb());
  const existing = await db
    .select({ id: schema.chatAgent.id })
    .from(schema.chatAgent)
    .where(eq(schema.chatAgent.id, id))
    .limit(1);
  if (!existing[0]) return false;
  await db.delete(schema.chatAgent).where(eq(schema.chatAgent.id, id));
  return true;
}
