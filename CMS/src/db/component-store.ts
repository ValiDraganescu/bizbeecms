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
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import type { ComponentArtifactInput } from "@/lib/chat/component-tool";
import type { ComponentRow, ImportedComponent } from "@/lib/components/portable";
// Relative .ts import (not @/) — node --test can't resolve the @/ alias for a
// RUNTIME import (the @/ imports here are type-only and erased). See CAVEATS.
import { serializeTags, parseTags } from "../lib/components/tags.ts";
import { parseHtml, treeToHtml } from "../lib/render/parse-html.ts";

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
      html: schema.component.html,
      script: schema.component.script,
      css: schema.component.css,
      propsSchema: schema.component.propsSchema,
      tags: schema.component.tags,
    })
    .from(schema.component);
  return rows
    .map((r) => ({
      name: r.name,
      tree: JSON.stringify(parseHtml(r.html)),
      script: r.script,
      css: r.css,
      propsSchema: r.propsSchema,
      tags: r.tags,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A component name + the kit it was installed from (null = individually imported)
 * + its operator tags (component-kits) — feeds both rail groupings (by kit / by tag).
 */
export interface NamedKitComponent {
  name: string;
  sourceKit: string | null;
  tags: string[];
}

/**
 * List every component's name + its `sourceKit` origin + operator `tags` (for the
 * page-builder rail's grouped views — by kit AND by tag). Names only — the rail
 * doesn't need the full artifact to list.
 */
export async function listComponentsWithKit(): Promise<NamedKitComponent[]> {
  const db = await getDb();
  const rows = await db
    .select({
      name: schema.component.name,
      sourceKit: schema.component.sourceKit,
      tags: schema.component.tags,
    })
    .from(schema.component);
  return rows.map((r) => ({
    name: r.name,
    sourceKit: r.sourceKit,
    tags: parseTags(r.tags),
  }));
}

/**
 * Of the given component names, return the subset that DON'T exist in this Site
 * (H3b — nested-component dep warning on import). Empty input → empty result.
 */
export async function missingComponentNames(
  names: string[],
  injectedDb?: Db,
): Promise<string[]> {
  if (names.length === 0) return [];
  const db = injectedDb ?? (await getDb());
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
      html: schema.component.html,
      script: schema.component.script,
      css: schema.component.css,
      propsSchema: schema.component.propsSchema,
      tags: schema.component.tags,
    })
    .from(schema.component)
    .where(eq(schema.component.name, name))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    name: r.name,
    tree: JSON.stringify(parseHtml(r.html)),
    script: r.script,
    css: r.css,
    propsSchema: r.propsSchema,
    tags: r.tags,
  };
}

/**
 * Import (insert or update by unique `name`) a validated portable component
 * (epic H2). Unlike `upsertComponent`, this also persists `propsSchema` (the
 * AI write path doesn't carry it). The bundle is ALREADY validated by
 * `parsePortableComponent` (the import trust boundary) before it reaches here.
 */
export async function upsertImportedComponent(
  c: ImportedComponent,
  injectedDb?: Db,
  sourceKit: string | null = null,
): Promise<{ action: "created" | "updated"; name: string }> {
  const db = injectedDb ?? (await getDb());
  const now = new Date();

  const existing = await db
    .select({ id: schema.component.id })
    .from(schema.component)
    .where(eq(schema.component.name, c.name))
    .limit(1);

  const cols = {
    html: treeToHtml(c.tree),
    script: c.script,
    css: c.css,
    propsSchema: c.propsSchema,
    sourceKit,
    tags: serializeTags(c.tags),
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
 * Tags-only update by unique `name` (component-kits Slice 2). Writes ONLY the
 * `tags` column — never the artifact (`upsertComponent` deliberately doesn't
 * touch tags; this is its mirror). Returns whether a row matched. The tag list
 * is normalized/serialized canonically via `serializeTags`.
 */
export async function updateComponentTags(
  name: string,
  tags: unknown,
  injectedDb?: Db,
): Promise<{ updated: boolean; name: string; tags: string }> {
  const db = injectedDb ?? (await getDb());
  const serialized = serializeTags(tags);
  const existing = await db
    .select({ id: schema.component.id })
    .from(schema.component)
    .where(eq(schema.component.name, name))
    .limit(1);
  if (existing.length === 0) return { updated: false, name, tags: serialized };
  await db
    .update(schema.component)
    .set({ tags: serialized, updatedAt: new Date() })
    .where(eq(schema.component.name, name));
  return { updated: true, name, tags: serialized };
}

/**
 * Insert or update a component by its unique `name`. Returns the action taken so
 * the chat route can tell the model "created" vs "updated".
 */
export async function upsertComponent(
  artifact: ComponentArtifactInput,
  injectedDb?: Db,
): Promise<{ action: "created" | "updated"; name: string }> {
  const db = injectedDb ?? (await getDb());
  const now = new Date();

  const existing = await db
    .select({ id: schema.component.id })
    .from(schema.component)
    .where(eq(schema.component.name, artifact.name))
    .limit(1);

  // propsSchema carries the preview PLACEHOLDER data (its `default`s). Only
  // overwrite when the artifact supplies one, so re-emitting without a schema
  // (a static iteration) doesn't wipe an existing one. `null` clears it.
  const propsSchema = artifact.propsSchema ?? null;

  if (existing.length > 0) {
    await db
      .update(schema.component)
      .set({
        html: treeToHtml(artifact.tree),
        script: artifact.script,
        css: artifact.css,
        ...(artifact.propsSchema !== undefined ? { propsSchema } : {}),
        updatedAt: now,
      })
      .where(eq(schema.component.name, artifact.name));
    return { action: "updated", name: artifact.name };
  }

  await db.insert(schema.component).values({
    id: crypto.randomUUID(),
    name: artifact.name,
    html: treeToHtml(artifact.tree),
    script: artifact.script,
    css: artifact.css,
    propsSchema,
    createdAt: now,
    updatedAt: now,
  });
  return { action: "created", name: artifact.name };
}

/**
 * Delete one component by unique `name` (admin Develop page). Returns whether a
 * row matched. ponytail: no soft-delete / cascade — a page block referencing a
 * now-missing component already renders a visible placeholder (planPage's
 * unknown-component path), so a dangling reference is self-announcing, not a crash.
 */
export async function deleteComponent(
  name: string,
  injectedDb?: Db,
): Promise<{ deleted: boolean }> {
  const db = injectedDb ?? (await getDb());
  const existing = await db
    .select({ id: schema.component.id })
    .from(schema.component)
    .where(eq(schema.component.name, name))
    .limit(1);
  if (existing.length === 0) return { deleted: false };
  await db.delete(schema.component).where(eq(schema.component.name, name));
  return { deleted: true };
}
