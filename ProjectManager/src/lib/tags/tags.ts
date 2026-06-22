import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Tag } from "@/db/schema";

/**
 * Managed org tags (pm-roles Slice 3b). Admins curate this vocabulary
 * (company group, TO channel, …); Sites and Managers later reference the ids.
 * Deleting a tag cascades its `site_tags`/`user_tags` rows (onDelete cascade in
 * the schema/migration), so no manual join cleanup is needed here.
 */

/** All tags, alphabetical by label. */
export async function listTags(): Promise<Tag[]> {
  const db = await getDb();
  return db.select().from(schema.tags).orderBy(asc(schema.tags.label));
}

/** True if another tag already uses this label (case-insensitive, optionally excluding one id). */
export async function isLabelTaken(
  label: string,
  excludeId?: string,
): Promise<boolean> {
  const lower = label.toLowerCase();
  const rows = await (await getDb())
    .select({ id: schema.tags.id, label: schema.tags.label })
    .from(schema.tags);
  return rows.some(
    (r) => r.label.toLowerCase() === lower && r.id !== excludeId,
  );
}

export async function createTag(label: string): Promise<Tag> {
  const db = await getDb();
  const [tag] = await db
    .insert(schema.tags)
    .values({ id: crypto.randomUUID(), label })
    .returning();
  return tag;
}

export async function renameTag(id: string, label: string): Promise<Tag | null> {
  const db = await getDb();
  const [tag] = await db
    .update(schema.tags)
    .set({ label })
    .where(eq(schema.tags.id, id))
    .returning();
  return tag ?? null;
}

export async function deleteTag(id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(schema.tags)
    .where(eq(schema.tags.id, id))
    .returning({ id: schema.tags.id });
  return rows.length > 0;
}
