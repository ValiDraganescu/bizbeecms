/**
 * D1 persistence for the create/update-component tool (Milestone 2, epic B2).
 *
 * Thin write layer over the `component` table (A1). The artifact has already
 * been VALIDATED by `validateComponentArtifact` (pure, in lib/chat) before it
 * reaches here — this module only does the upsert. `name` is UNIQUE, so calling
 * the tool with an existing name updates that component (the AI iterating on a
 * component re-emits it under the same name).
 *
 * Build-verified only: the live D1 write needs a real binding (HITL).
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "./index";
import type { ComponentArtifactInput } from "@/lib/chat/component-tool";

/**
 * List the Site's component names (for the AI system prompt — so the model
 * reuses existing components instead of re-authoring them). Names only; the full
 * artifact isn't needed for the prompt.
 */
export async function listComponentNames(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ name: schema.component.name })
    .from(schema.component);
  return rows.map((r) => r.name);
}

/**
 * Insert or update a component by its unique `name`. Returns the action taken so
 * the chat route can tell the model "created" vs "updated".
 */
export async function upsertComponent(
  artifact: ComponentArtifactInput,
): Promise<{ action: "created" | "updated"; name: string }> {
  const db = await getDb();
  const now = new Date();

  const existing = await db
    .select({ id: schema.component.id })
    .from(schema.component)
    .where(eq(schema.component.name, artifact.name))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.component)
      .set({
        tree: JSON.stringify(artifact.tree),
        script: artifact.script,
        css: artifact.css,
        updatedAt: now,
      })
      .where(eq(schema.component.name, artifact.name));
    return { action: "updated", name: artifact.name };
  }

  await db.insert(schema.component).values({
    id: crypto.randomUUID(),
    name: artifact.name,
    tree: JSON.stringify(artifact.tree),
    script: artifact.script,
    css: artifact.css,
    createdAt: now,
    updatedAt: now,
  });
  return { action: "created", name: artifact.name };
}
