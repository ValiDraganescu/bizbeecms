/**
 * public-guest-chatbots persistence — CRUD store for `chat_conversation`.
 *
 * One row per client-generated conversation (its `id` is the widget's UUID). The
 * public-chat route UPSERTS the full conversation after each turn; the admin
 * viewer LISTS conversations per agent and reads one back in full. Modeled on
 * `chat-agent-store.ts`: reads D1 ONLY via the `Db` port (never `env.DB`), keeps
 * the JSON `payload` opaque, and stays node-testable via `injectedDb`.
 *
 * SCOPING: every read is scoped by `agentId`, and `upsertConversation` REJECTS an
 * id that already belongs to a DIFFERENT agent — a guessed UUID can never let one
 * agent's visitor overwrite (or read) another agent's conversation.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";

/** The full conversation row (incl. the gateway-fidelity `payload` JSON). */
export type ChatConversationRow = {
  id: string;
  agentId: string;
  pageId: string | null;
  blockId: string | null;
  timezone: string | null;
  utcOffsetMinutes: number | null;
  model: string | null;
  messageCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  payload: string;
  createdAt: Date;
  updatedAt: Date;
};

/** The fields the route supplies on upsert (`payload` is the raw gateway JSON). */
export type ChatConversationInput = {
  id: string;
  agentId: string;
  pageId: string | null;
  blockId: string | null;
  timezone: string | null;
  utcOffsetMinutes: number | null;
  model: string | null;
  messageCount: number;
  promptTokens: number;
  completionTokens: number;
  payload: string;
};

/** A list-view row — everything EXCEPT the heavy `payload` blob. */
export type ChatConversationSummary = {
  id: string;
  messageCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  timezone: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRow(row: typeof schema.chatConversation.$inferSelect): ChatConversationRow {
  return {
    id: row.id,
    agentId: row.agentId,
    pageId: row.pageId,
    blockId: row.blockId,
    timezone: row.timezone,
    utcOffsetMinutes: row.utcOffsetMinutes,
    model: row.model,
    messageCount: row.messageCount,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    payload: row.payload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Insert or full-update a conversation by id. The FIRST write for an id sets its
 * `agentId`; a later write whose `agentId` differs is REJECTED (`{ok:false}`) so a
 * guessed UUID can't cross agents. `createdAt` is preserved across updates;
 * `updatedAt` bumps every write.
 */
export async function upsertConversation(
  input: ChatConversationInput,
  injectedDb?: Db,
): Promise<{ ok: true } | { ok: false }> {
  const db = injectedDb ?? (await getDb());
  const existing = await db
    .select({ agentId: schema.chatConversation.agentId })
    .from(schema.chatConversation)
    .where(eq(schema.chatConversation.id, input.id))
    .limit(1);

  if (existing[0]) {
    if (existing[0].agentId !== input.agentId) return { ok: false };
    await db
      .update(schema.chatConversation)
      .set({
        pageId: input.pageId,
        blockId: input.blockId,
        timezone: input.timezone,
        utcOffsetMinutes: input.utcOffsetMinutes,
        model: input.model,
        messageCount: input.messageCount,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        payload: input.payload,
        updatedAt: new Date(),
      })
      .where(eq(schema.chatConversation.id, input.id));
    return { ok: true };
  }

  const now = new Date();
  await db.insert(schema.chatConversation).values({
    id: input.id,
    agentId: input.agentId,
    pageId: input.pageId,
    blockId: input.blockId,
    timezone: input.timezone,
    utcOffsetMinutes: input.utcOffsetMinutes,
    model: input.model,
    messageCount: input.messageCount,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true };
}

/**
 * List an agent's conversations (newest first), WITHOUT the `payload` blob — the
 * list view never parses it. Returns the page of summaries + the agent's total
 * count for pagination.
 */
export async function listConversations(
  agentId: string,
  opts: { limit: number; offset: number },
  injectedDb?: Db,
): Promise<{ rows: ChatConversationSummary[]; total: number }> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({
      id: schema.chatConversation.id,
      messageCount: schema.chatConversation.messageCount,
      promptTokens: schema.chatConversation.promptTokens,
      completionTokens: schema.chatConversation.completionTokens,
      timezone: schema.chatConversation.timezone,
      createdAt: schema.chatConversation.createdAt,
      updatedAt: schema.chatConversation.updatedAt,
    })
    .from(schema.chatConversation)
    .where(eq(schema.chatConversation.agentId, agentId))
    .orderBy(desc(schema.chatConversation.updatedAt))
    .limit(opts.limit)
    .offset(opts.offset);

  const counted = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.chatConversation)
    .where(eq(schema.chatConversation.agentId, agentId));

  return { rows, total: Number(counted[0]?.total ?? 0) };
}

/**
 * Read one conversation in full, SCOPED to its agent. `agentId` is mandatory: a
 * row whose id matches but whose agent differs returns null (never leaks another
 * agent's conversation to an operator who lacks access).
 */
export async function getConversation(
  agentId: string,
  id: string,
  injectedDb?: Db,
): Promise<ChatConversationRow | null> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select()
    .from(schema.chatConversation)
    .where(
      and(eq(schema.chatConversation.id, id), eq(schema.chatConversation.agentId, agentId)),
    )
    .limit(1);
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * Delete one conversation, SCOPED to its agent. Returns `true` when a row was
 * removed, `false` when nothing matched (unknown id, or an id that belongs to a
 * different agent — same cross-agent guard as {@link getConversation}).
 */
export async function deleteConversation(
  agentId: string,
  id: string,
  injectedDb?: Db,
): Promise<boolean> {
  const db = injectedDb ?? (await getDb());
  const result = await db
    .delete(schema.chatConversation)
    .where(
      and(eq(schema.chatConversation.id, id), eq(schema.chatConversation.agentId, agentId)),
    )
    .returning({ id: schema.chatConversation.id });
  return result.length > 0;
}
