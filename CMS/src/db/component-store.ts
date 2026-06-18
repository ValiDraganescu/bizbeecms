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
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./index";
import type { ComponentArtifactInput } from "@/lib/chat/component-tool";
import type { ComponentRow, ImportedComponent } from "@/lib/components/portable";

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
 * List components for the admin export/import UI (epic H). Returns the raw
 * portable columns (tree is a JSON string in D1; `serializeComponent` parses it).
 * Sorted by name for a stable listing.
 */
export async function listComponents(): Promise<ComponentRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      name: schema.component.name,
      tree: schema.component.tree,
      script: schema.component.script,
      css: schema.component.css,
      propsSchema: schema.component.propsSchema,
    })
    .from(schema.component);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Of the given component names, return the subset that DON'T exist in this Site
 * (H3b — nested-component dep warning on import). Empty input → empty result.
 */
export async function missingComponentNames(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ name: schema.component.name })
    .from(schema.component)
    .where(inArray(schema.component.name, names));
  const present = new Set(rows.map((r) => r.name));
  return names.filter((n) => !present.has(n));
}

/** Fetch one component's portable columns by unique name (export), or null. */
export async function getComponentByName(name: string): Promise<ComponentRow | null> {
  const db = await getDb();
  const rows = await db
    .select({
      name: schema.component.name,
      tree: schema.component.tree,
      script: schema.component.script,
      css: schema.component.css,
      propsSchema: schema.component.propsSchema,
    })
    .from(schema.component)
    .where(eq(schema.component.name, name))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Import (insert or update by unique `name`) a validated portable component
 * (epic H2). Unlike `upsertComponent`, this also persists `propsSchema` (the
 * AI write path doesn't carry it). The bundle is ALREADY validated by
 * `parsePortableComponent` (the import trust boundary) before it reaches here.
 */
export async function upsertImportedComponent(
  c: ImportedComponent,
): Promise<{ action: "created" | "updated"; name: string }> {
  const db = await getDb();
  const now = new Date();

  const existing = await db
    .select({ id: schema.component.id })
    .from(schema.component)
    .where(eq(schema.component.name, c.name))
    .limit(1);

  const cols = {
    tree: JSON.stringify(c.tree),
    script: c.script,
    css: c.css,
    propsSchema: c.propsSchema,
    updatedAt: now,
  };

  if (existing.length > 0) {
    await db.update(schema.component).set(cols).where(eq(schema.component.name, c.name));
    return { action: "updated", name: c.name };
  }

  await db.insert(schema.component).values({
    id: crypto.randomUUID(),
    name: c.name,
    createdAt: now,
    ...cols,
  });
  return { action: "created", name: c.name };
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
