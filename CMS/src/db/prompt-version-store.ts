/**
 * D1 persistence for saved system-prompt versions (ai-widget-ux — PM-SSO prompt
 * editor). Per-Site — the DB IS the Site boundary, so versions aren't
 * site-scoped (like every other CMS table). Thin binding layer; the pure
 * shape/validation lives in `lib/chat/prompt-version.ts`. Build-verified only:
 * live D1 needs a real binding (HITL).
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import type { PromptVersion } from "@/lib/chat/prompt-version";

function rowToVersion(r: {
  id: string;
  label: string;
  prompt: string;
  createdAt: Date | number;
}): PromptVersion {
  return {
    id: r.id,
    label: r.label,
    prompt: r.prompt,
    createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt),
  };
}

/** List saved prompt versions, newest first. */
export async function listPromptVersions(injectedDb?: Db): Promise<PromptVersion[]> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select()
    .from(schema.promptVersion)
    .orderBy(desc(schema.promptVersion.createdAt))
    .limit(100);
  return rows.map(rowToVersion);
}

/** Fetch one version by id, or null if absent. */
export async function getPromptVersion(id: string, injectedDb?: Db): Promise<PromptVersion | null> {
  const db = injectedDb ?? (await getDb());
  const [row] = await db.select().from(schema.promptVersion).where(eq(schema.promptVersion.id, id)).limit(1);
  return row ? rowToVersion(row) : null;
}

/** Create a new version. Returns the stored row. */
export async function createPromptVersion(
  input: { label: string; prompt: string },
  injectedDb?: Db,
): Promise<PromptVersion> {
  const db = injectedDb ?? (await getDb());
  const id = `pv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await db.insert(schema.promptVersion).values({ id, label: input.label, prompt: input.prompt });
  return { id, label: input.label, prompt: input.prompt, createdAt: Date.now() };
}

/** Update a version's label and/or prompt. Returns the new row, or null if absent. */
export async function updatePromptVersion(
  id: string,
  patch: { label?: string; prompt?: string },
  injectedDb?: Db,
): Promise<PromptVersion | null> {
  const db = injectedDb ?? (await getDb());
  const fields: { label?: string; prompt?: string } = {};
  if (patch.label !== undefined) fields.label = patch.label;
  if (patch.prompt !== undefined) fields.prompt = patch.prompt;
  if (Object.keys(fields).length === 0) {
    // nothing to change — return the current row as-is
    const [row] = await db.select().from(schema.promptVersion).where(eq(schema.promptVersion.id, id)).limit(1);
    return row ? rowToVersion(row) : null;
  }
  await db.update(schema.promptVersion).set(fields).where(eq(schema.promptVersion.id, id));
  const [row] = await db.select().from(schema.promptVersion).where(eq(schema.promptVersion.id, id)).limit(1);
  return row ? rowToVersion(row) : null;
}

/** Delete a version by id. No-op if it doesn't exist. */
export async function deletePromptVersion(id: string, injectedDb?: Db): Promise<void> {
  const db = injectedDb ?? (await getDb());
  await db.delete(schema.promptVersion).where(eq(schema.promptVersion.id, id));
}
