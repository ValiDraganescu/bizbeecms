/**
 * D1 persistence for saved AI-assistant conversations (Milestone 2,
 * ai-assistant goal, Slice 4 sub-slice 3). Per-Site — the DB IS the Site
 * boundary, so threads aren't site-scoped (like every other CMS table).
 *
 * The pure shape/validation lives in `lib/chat/history.ts`; this module is the
 * thin binding layer (list / get / save-upsert / delete). Build-verified only:
 * live D1 needs a real binding (HITL).
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import {
  newThreadId,
  parseStoredMessages,
  type ThreadInput,
  type ThreadMessage,
} from "@/lib/chat/history";

export type ThreadSummary = { id: string; title: string; updatedAt: number };
export type Thread = ThreadSummary & { messages: ThreadMessage[] };

/** List saved threads (metadata only), newest-updated first. */
export async function listThreads(injectedDb?: Db): Promise<ThreadSummary[]> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({
      id: schema.chatThread.id,
      title: schema.chatThread.title,
      updatedAt: schema.chatThread.updatedAt,
    })
    .from(schema.chatThread)
    .orderBy(desc(schema.chatThread.updatedAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.getTime() : Number(r.updatedAt),
  }));
}

/** Read one thread + its transcript, or null if it doesn't exist. */
export async function getThread(id: string, injectedDb?: Db): Promise<Thread | null> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({
      id: schema.chatThread.id,
      title: schema.chatThread.title,
      messages: schema.chatThread.messages,
      updatedAt: schema.chatThread.updatedAt,
    })
    .from(schema.chatThread)
    .where(eq(schema.chatThread.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    messages: parseStoredMessages(row.messages),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : Number(row.updatedAt),
  };
}

/**
 * Insert or update a thread (upsert by id). A null id mints a fresh one, so the
 * client can POST a new conversation and learn its server-side id from the
 * return value (then keep saving under it on subsequent turns).
 */
export async function saveThread(
  input: Omit<ThreadInput, "id"> & { id: string | null },
  injectedDb?: Db,
): Promise<{ id: string; action: "created" | "updated" }> {
  const db = injectedDb ?? (await getDb());
  const now = new Date();
  const messagesJson = JSON.stringify(input.messages);

  if (input.id) {
    const existing = await db
      .select({ id: schema.chatThread.id })
      .from(schema.chatThread)
      .where(eq(schema.chatThread.id, input.id))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(schema.chatThread)
        .set({ title: input.title, messages: messagesJson, updatedAt: now })
        .where(eq(schema.chatThread.id, input.id));
      return { id: input.id, action: "updated" };
    }
  }

  const id = input.id ?? newThreadId();
  await db.insert(schema.chatThread).values({
    id,
    title: input.title,
    messages: messagesJson,
    createdAt: now,
    updatedAt: now,
  });
  return { id, action: "created" };
}

/** Delete a thread by id (no-op if it doesn't exist). */
export async function deleteThread(id: string, injectedDb?: Db): Promise<void> {
  const db = injectedDb ?? (await getDb());
  await db.delete(schema.chatThread).where(eq(schema.chatThread.id, id));
}
