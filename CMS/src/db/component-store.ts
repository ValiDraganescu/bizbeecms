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
import {
  collectComponentNames,
  collectTreeComponentTags,
  type Block,
} from "../lib/render/tree.ts";
import {
  findComponentUsage,
  type PageRefs,
  type ComponentDeps,
  type Usage,
} from "../lib/components/usage.ts";
import { artifactUnchanged } from "../lib/components/artifact-diff.ts";

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
      label: schema.component.label,
      kind: schema.component.kind,
      updatedAt: schema.component.updatedAt,
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
      label: r.label,
      kind: r.kind,
      updatedAt: r.updatedAt,
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

/**
 * Fetch one component's portable columns by unique name, or null.
 *
 * `preferDraft` (default false = LIVE): the AI authoring loop (get_component,
 * edit_text base, update_component's omit-fallbacks) passes `true` so it reads
 * and edits the pending DRAFT, not stale live — otherwise a live-based edit would
 * clobber an unpublished draft. Export/portable keeps the default (live artifact).
 */
export async function getComponentByName(
  name: string,
  preferDraft = false,
): Promise<ComponentRow | null> {
  const db = await getDb();
  const rows = await db
    .select({
      name: schema.component.name,
      html: schema.component.html,
      script: schema.component.script,
      css: schema.component.css,
      propsSchema: schema.component.propsSchema,
      tags: schema.component.tags,
      label: schema.component.label,
      hasDraft: schema.component.hasDraft,
      draftHtml: schema.component.draftHtml,
      draftScript: schema.component.draftScript,
      draftCss: schema.component.draftCss,
      draftPropsSchema: schema.component.draftPropsSchema,
      draftLabel: schema.component.draftLabel,
      kind: schema.component.kind,
      draftKind: schema.component.draftKind,
    })
    .from(schema.component)
    .where(eq(schema.component.name, name))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const useDraft = preferDraft && r.hasDraft;
  return {
    name: r.name,
    tree: JSON.stringify(parseHtml(useDraft ? r.draftHtml ?? "" : r.html)),
    script: useDraft ? r.draftScript ?? "" : r.script,
    css: useDraft ? r.draftCss ?? "" : r.css,
    propsSchema: useDraft ? r.draftPropsSchema : r.propsSchema,
    tags: r.tags,
    label: useDraft ? r.draftLabel : r.label,
    // draft_kind is null when there's no pending kind change, so the draft's
    // effective kind falls back to live (mirrors publishComponentDraft's
    // `draftKind ?? kind`). Live read always returns the committed kind.
    kind: useDraft ? r.draftKind ?? r.kind : r.kind,
    // The RAW `html` column verbatim. For a jsonld component this is the JSON-LD
    // TEMPLATE (which `tree` above mangles, since parseHtml treats it as markup).
    // The Develop workbench needs the un-mangled template to edit; it's carried
    // here so the GET route can ship it out-of-band (like `kind`) without
    // polluting the portable bundle (`serializeComponent` ignores this field).
    jsonTemplate: useDraft ? r.draftHtml ?? "" : r.html,
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

  // The `html` column holds the JSON template verbatim for a jsonld component, or
  // the serialized tree for an html component. `kind` is undefined when the caller
  // didn't specify one (an update leaves the stored kind alone; a create defaults
  // to "html" via the column default).
  const artifactHtml =
    artifact.kind === "jsonld" ? artifact.jsonTemplate ?? "" : treeToHtml(artifact.tree);

  const existing = await db
    .select({
      id: schema.component.id,
      html: schema.component.html,
      script: schema.component.script,
      css: schema.component.css,
      propsSchema: schema.component.propsSchema,
      label: schema.component.label,
      kind: schema.component.kind,
      hasDraft: schema.component.hasDraft,
    })
    .from(schema.component)
    .where(eq(schema.component.name, artifact.name))
    .limit(1);

  // propsSchema carries the preview PLACEHOLDER data (its `default`s). Only
  // overwrite when the artifact supplies one, so re-emitting without a schema
  // (a static iteration) doesn't wipe an existing one. `null` clears it.
  const propsSchema = artifact.propsSchema ?? null;
  // Same semantics for tags: write only when the artifact supplies them, so an
  // iteration that omits tags doesn't wipe operator labels (mirrors propsSchema).
  const tags = artifact.tags !== undefined ? serializeTags(artifact.tags) : undefined;
  // label: omit → leave; "" → clear (store NULL so the UI falls back to `name`).
  const label = artifact.label === undefined ? undefined : artifact.label === "" ? null : artifact.label;

  if (existing.length > 0) {
    // An edit to an EXISTING component writes the DRAFT artifact (draft_* columns)
    // and flags has_draft — the LIVE columns (what public pages render) are left
    // untouched until an explicit publish. This is the safe-edit gate: iterating
    // on a component no longer silently changes live pages. Tags stay live-only
    // (operator metadata, not part of the rendered artifact).
    //
    // A DRAFT is a COMPLETE artifact snapshot, so an omitted propsSchema/label
    // inherits the LIVE value (not null) — same "omit → keep" semantics the live
    // upsert had, applied to the draft copy.
    const cur = existing[0];
    const nextHtml = artifactHtml;
    const nextPropsSchema =
      artifact.propsSchema !== undefined ? propsSchema : cur.propsSchema;
    const nextLabel = label !== undefined ? label : cur.label;
    // kind: omit → keep the live kind (an html-only edit never flips kind); a
    // supplied kind (e.g. switching a component to jsonld) becomes the draft kind.
    const curKind = cur.kind ?? "html";
    const nextKind = artifact.kind ?? curKind;

    // NO-OP GUARD: if the incoming artifact is byte-identical to the LIVE one,
    // don't create a draft (and don't set has_draft). Merely OPENING a component
    // round-trips its html through the editor and autosaves — that must not show
    // "unpublished changes" when nothing actually changed. Tags may still update
    // (they're live metadata, not part of the rendered/publishable artifact).
    const unchanged =
      nextKind === curKind &&
      artifactUnchanged(
        { html: cur.html, script: cur.script, css: cur.css, propsSchema: cur.propsSchema, label: cur.label },
        { html: nextHtml, script: artifact.script, css: artifact.css, propsSchema: nextPropsSchema, label: nextLabel },
      );

    if (unchanged) {
      if (tags !== undefined) {
        await db
          .update(schema.component)
          .set({ tags, updatedAt: now })
          .where(eq(schema.component.name, artifact.name));
      }
      return { action: "updated", name: artifact.name };
    }

    await db
      .update(schema.component)
      .set({
        draftHtml: nextHtml,
        draftScript: artifact.script,
        draftCss: artifact.css,
        draftPropsSchema: nextPropsSchema,
        draftLabel: nextLabel,
        // Only stage a draft kind when it differs from live (else null = no pending
        // kind change) so publish/discard's draft_kind handling stays meaningful.
        draftKind: nextKind === curKind ? null : nextKind,
        hasDraft: true,
        ...(tags !== undefined ? { tags } : {}),
        updatedAt: now,
      })
      .where(eq(schema.component.name, artifact.name));
    return { action: "updated", name: artifact.name };
  }

  await db.insert(schema.component).values({
    id: crypto.randomUUID(),
    name: artifact.name,
    html: artifactHtml,
    script: artifact.script,
    css: artifact.css,
    propsSchema,
    // Default "html" via the column default when the caller didn't specify.
    ...(artifact.kind ? { kind: artifact.kind } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(label !== undefined ? { label } : {}),
    createdAt: now,
    updatedAt: now,
  });
  return { action: "created", name: artifact.name };
}

/**
 * PUBLISH a component's pending draft: copy the draft_* artifact into the LIVE
 * columns (html/script/css/props/label) and clear has_draft + the draft columns.
 * After this, public pages render the new artifact. No-op (published:false) if
 * there's no pending draft. Returns whether a publish happened.
 */
export async function publishComponentDraft(
  name: string,
  injectedDb?: Db,
): Promise<{ published: boolean }> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({
      hasDraft: schema.component.hasDraft,
      draftHtml: schema.component.draftHtml,
      draftScript: schema.component.draftScript,
      draftCss: schema.component.draftCss,
      draftPropsSchema: schema.component.draftPropsSchema,
      draftLabel: schema.component.draftLabel,
      draftKind: schema.component.draftKind,
      kind: schema.component.kind,
    })
    .from(schema.component)
    .where(eq(schema.component.name, name))
    .limit(1);
  const row = rows[0];
  if (!row || !row.hasDraft) return { published: false };

  await db
    .update(schema.component)
    .set({
      // Copy draft → live. Draft html/script/css are always full snapshots (the
      // edit path writes all three); fall back to "" to satisfy the NOT NULL live
      // columns if a draft somehow lacks one.
      html: row.draftHtml ?? "",
      script: row.draftScript ?? "",
      css: row.draftCss ?? "",
      propsSchema: row.draftPropsSchema,
      label: row.draftLabel,
      // draft_kind is only set when the edit CHANGED the kind (else null = no
      // pending change), so publish only overrides live kind when a draft kind exists.
      kind: row.draftKind ?? row.kind ?? "html",
      // Clear the draft.
      hasDraft: false,
      draftHtml: null,
      draftScript: null,
      draftCss: null,
      draftPropsSchema: null,
      draftLabel: null,
      draftKind: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.component.name, name));
  return { published: true };
}

/**
 * DISCARD a component's pending draft: clear has_draft + the draft columns,
 * leaving the LIVE artifact untouched. No-op (discarded:false) if no draft.
 */
export async function discardComponentDraft(
  name: string,
  injectedDb?: Db,
): Promise<{ discarded: boolean }> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ hasDraft: schema.component.hasDraft })
    .from(schema.component)
    .where(eq(schema.component.name, name))
    .limit(1);
  if (!rows[0] || !rows[0].hasDraft) return { discarded: false };

  await db
    .update(schema.component)
    .set({
      hasDraft: false,
      draftHtml: null,
      draftScript: null,
      draftCss: null,
      draftPropsSchema: null,
      draftLabel: null,
      draftKind: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.component.name, name));
  return { discarded: true };
}

/** Whether a component has a pending (unpublished) draft. False if the name is unknown. */
export async function getComponentDraftState(name: string, injectedDb?: Db): Promise<boolean> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ hasDraft: schema.component.hasDraft })
    .from(schema.component)
    .where(eq(schema.component.name, name))
    .limit(1);
  return rows[0]?.hasDraft ?? false;
}

/**
 * "Where is this component used?" — the LIVE pages a `name` edit would affect.
 *
 * Blast radius over PUBLISHED page content: a page counts if its published blocks
 * reference `name` directly, or transitively through a component→component
 * composition tag. Loads each page's published-version blocks (fallback
 * `page.blocks`) + every component's tree (for the dep graph), then delegates to
 * the pure `findComponentUsage`. Sorted direct-first. Empty = safe to edit.
 */
export async function getComponentUsage(name: string, injectedDb?: Db): Promise<Usage[]> {
  const db = injectedDb ?? (await getDb());

  // Pages + their PUBLISHED block source (published version blocks, else legacy).
  const pageRows = await db
    .select({
      id: schema.page.id,
      slug: schema.page.slug,
      blocks: schema.page.blocks,
      publishedVersionId: schema.page.publishedVersionId,
    })
    .from(schema.page);

  const pubIds = pageRows.map((p) => p.publishedVersionId).filter((x): x is string => !!x);
  const versions = pubIds.length
    ? await db
        .select({ id: schema.pageVersion.id, blocks: schema.pageVersion.blocks })
        .from(schema.pageVersion)
        .where(inArray(schema.pageVersion.id, pubIds))
    : [];
  const versionBlocks = new Map(versions.map((v) => [v.id, v.blocks]));

  const pages: PageRefs[] = pageRows.map((p) => {
    const raw = (p.publishedVersionId && versionBlocks.get(p.publishedVersionId)) || p.blocks;
    let blocks: Block[] = [];
    try {
      blocks = JSON.parse(raw) as Block[];
    } catch {
      /* unparseable blocks → treat as referencing nothing */
    }
    return { id: p.id, slug: p.slug, components: [...collectComponentNames(blocks)] };
  });

  // Component dependency graph: each LIVE component tree → the component tags it
  // references. (Blast radius is about what's published, so use live html, not draft.)
  const compRows = await db
    .select({ name: schema.component.name, html: schema.component.html })
    .from(schema.component);
  const deps: ComponentDeps = new Map(
    compRows.map((c) => [c.name, collectTreeComponentTags(parseHtml(c.html))]),
  );

  return findComponentUsage(name, pages, deps);
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
