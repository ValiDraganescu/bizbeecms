/**
 * Shared CMS AI tool dispatch (cms-mcp Slice 1) — the ONE place tool calls run.
 *
 * Both the browser chat route (`app/api/chat/route.ts`, cookie-authed SSE) and
 * the upcoming remote MCP server (per-Site Worker, API-key authed) call this so
 * there is a single validated tool path — no forked logic, no drifting safety
 * gates (see cms-mcp CAVEATS/GOAL). Each handler does the SAME validate→store work
 * the chat route did inline; the result is a plain `{ok, …}` payload (no SSE
 * coupling). The dispatcher (`runTool`) tags it with the tool `name`.
 *
 * The tool registry (`TOOL_BY_NAME`) is keyed by `function.name`, matching the
 * shared `KNOWN_TOOL_NAMES` in `tool-scopes.ts`. `toolSchemasForContext` /
 * `allToolSchemas` enumerate it, so a tool added to the registry is dispatchable
 * AND exposed everywhere (chat scopes + MCP) for free.
 *
 * CF-coupled (imports `@/db/*`) → NOT node-loadable. The pure dispatch/selection
 * logic lives in `tool-dispatch-core.ts` and is unit-tested there.
 */
import {
  CREATE_COMPONENT_TOOL,
  validateComponentArtifact,
} from "./component-tool";
import { CREATE_PAGE_TOOL, validatePageInput } from "./page-tool";
import {
  CREATE_TRANSLATION_TOOL,
  validateTranslationInput,
} from "./translate-tool";
import { LIST_ASSETS_TOOL, coerceLimit, formatAssetList } from "./list-assets-tool";
import {
  LIST_COMPONENTS_TOOL,
  GET_COMPONENT_TOOL,
  LIST_PAGES_TOOL,
  GET_PAGE_TOOL,
  LIST_LOCALES_TOOL,
  GET_BRAND_IDENTITY_TOOL,
  GET_THEME_TOOL,
  coerceIdArg,
  formatComponentList,
  formatPageList,
} from "./read-tools";
import {
  UPDATE_COMPONENT_TOOL,
  UPDATE_PAGE_BLOCKS_TOOL,
  UPDATE_BRAND_IDENTITY_TOOL,
  UPDATE_THEME_TOOL,
  LIST_BUILTIN_TYPES_TOOL,
  builtinBlockTypes,
  splitThemeArgs,
  coerceIdentityArg,
} from "./write-tools";
import {
  CREATE_COLLECTION_TOOL,
  ADD_COLLECTION_ITEM_TOOL,
  UPDATE_COLLECTION_ITEM_TOOL,
  ARCHIVE_COLLECTION_ITEM_TOOL,
  QUERY_COLLECTION_TOOL,
  DROP_COLLECTION_FIELD_TOOL,
  RENAME_COLLECTION_FIELD_TOOL,
  validateCreateCollection,
  validateAddItem,
  validateUpdateItem,
  validateArchiveItem,
  validateQuery,
  validateDropField,
  validateRenameField,
} from "./collection-tools";
import {
  BIND_COMPONENT_TOOL,
  CREATE_LIST_TOOL,
  BIND_LIST_TOOL,
  validateBindComponent,
  validateCreateList,
  validateBindList,
} from "./binding-tools";
import {
  LIST_PROMPTS_TOOL,
  CREATE_PROMPT_TOOL,
  UPDATE_PROMPT_TOOL,
  DELETE_PROMPT_TOOL,
  validateCreatePrompt,
  validateUpdatePrompt,
  coercePromptId,
} from "./prompt-tools";
import { EDIT_TEXT_TOOL, validateEditText } from "./edit-text-tool";
import { applyEdit } from "./apply-edit";
import {
  validateBlocks,
  findBlock,
  setBlockField,
  setBlockChildren,
  addListToSection,
  isList,
  isSection,
  LIST_COMPONENT,
} from "@/lib/pages/page-blocks";
import type { Block } from "@/lib/render/tree";
import {
  validateBinding,
  validateListBinding,
  declaredPropNames,
} from "@/lib/content/binding";
import {
  toolsForContext,
  type AdminPageContext,
  type ToolName,
} from "./tool-scopes";
import {
  makeDispatcher,
  selectToolSchemas,
  type ToolHandler,
  type DispatchResult,
} from "./tool-dispatch-core";
import {
  upsertComponent,
  listComponents,
  getComponentByName,
} from "@/db/component-store";
import {
  missingComponents,
  upsertPage,
  listPages,
  getPageById,
  getPageBlocks,
  setPageBlocks,
} from "@/db/page-store";
import { getCollection, rebuildCollectionSchema } from "@/db/collection-store";
import { applyTranslation } from "@/db/translate-store";
import {
  getContentLocales,
  getSiteIdentity,
  getThemeOverrides,
  getThemeOverridesDark,
  setSiteIdentity,
  setThemeOverrides,
  setThemeOverridesDark,
} from "@/db/settings-store";
import { listAssets } from "@/db/asset-store";
import { createCollection } from "@/db/collection-store";
import {
  createItem,
  updateItem,
  archiveItem,
  unarchiveItem,
  deleteItem,
} from "@/db/item-store";
import { queryCollection } from "@/db/query-store";
import {
  listPromptVersions,
  createPromptVersion,
  updatePromptVersion,
  deletePromptVersion,
  getPromptVersion,
} from "@/db/prompt-version-store";

export type { DispatchResult } from "./tool-dispatch-core";

// ── Tool registry ─────────────────────────────────────────────────────────────
// Keyed by the tool's function.name; the keys MUST match KNOWN_TOOL_NAMES in
// tool-scopes.ts. New tools land here and are exposed everywhere automatically.
export const TOOL_BY_NAME: Record<ToolName, unknown> = {
  create_component: CREATE_COMPONENT_TOOL,
  create_page: CREATE_PAGE_TOOL,
  translate: CREATE_TRANSLATION_TOOL,
  list_assets: LIST_ASSETS_TOOL,
  list_components: LIST_COMPONENTS_TOOL,
  get_component: GET_COMPONENT_TOOL,
  list_pages: LIST_PAGES_TOOL,
  get_page: GET_PAGE_TOOL,
  list_locales: LIST_LOCALES_TOOL,
  get_brand_identity: GET_BRAND_IDENTITY_TOOL,
  get_theme: GET_THEME_TOOL,
  list_builtin_types: LIST_BUILTIN_TYPES_TOOL,
  update_component: UPDATE_COMPONENT_TOOL,
  update_page_blocks: UPDATE_PAGE_BLOCKS_TOOL,
  update_brand_identity: UPDATE_BRAND_IDENTITY_TOOL,
  update_theme: UPDATE_THEME_TOOL,
  create_collection: CREATE_COLLECTION_TOOL,
  add_collection_item: ADD_COLLECTION_ITEM_TOOL,
  update_collection_item: UPDATE_COLLECTION_ITEM_TOOL,
  archive_collection_item: ARCHIVE_COLLECTION_ITEM_TOOL,
  query_collection: QUERY_COLLECTION_TOOL,
  drop_collection_field: DROP_COLLECTION_FIELD_TOOL,
  rename_collection_field: RENAME_COLLECTION_FIELD_TOOL,
  bind_component: BIND_COMPONENT_TOOL,
  create_list: CREATE_LIST_TOOL,
  bind_list: BIND_LIST_TOOL,
  list_prompts: LIST_PROMPTS_TOOL,
  create_prompt: CREATE_PROMPT_TOOL,
  update_prompt: UPDATE_PROMPT_TOOL,
  delete_prompt: DELETE_PROMPT_TOOL,
  edit_text: EDIT_TEXT_TOOL,
};

/** The tool SCHEMAS the assistant may use in this admin-page context (chat route). */
export function toolSchemasForContext(context: AdminPageContext): unknown[] {
  return selectToolSchemas(TOOL_BY_NAME, toolsForContext(context));
}

/** ALL tool schemas, ordered by the registry (the MCP server's full surface). */
export function allToolSchemas(): unknown[] {
  return Object.values(TOOL_BY_NAME);
}

// ── Handlers (validate → store), one per tool, returning a result payload ──────
// Each returns `{ok, …}` WITHOUT `name` — the dispatcher tags `name`. Failures
// (validation or D1) are returned as `{ok:false, errors}`, never thrown.

async function handleCreateComponent(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateComponentArtifact(args);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  try {
    const res = await upsertComponent(valid.artifact);
    return { ok: true, action: res.action, component: res.name };
  } catch (err) {
    return { ok: false, errors: [`failed to save component: ${(err as Error).message}`] };
  }
}

async function handleCreatePage(args: unknown): Promise<Record<string, unknown>> {
  const valid = validatePageInput(args);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  try {
    // Blocks reference component names — verify they exist before writing so the
    // model learns to create_component first (not silent placeholders).
    const missing = await missingComponents(valid.componentNames);
    if (missing.length > 0) {
      return { ok: false, errors: [`unknown components (create them first): ${missing.join(", ")}`] };
    }
    const res = await upsertPage(valid.page);
    if (!res.ok) return { ok: false, errors: res.errors };
    return { ok: true, action: res.action, page: res.slug };
  } catch (err) {
    return { ok: false, errors: [`failed to save page: ${(err as Error).message}`] };
  }
}

async function handleTranslate(args: unknown): Promise<Record<string, unknown>> {
  // Constrain the model to the Site's configured content locales (C1).
  let allowedLocales: string[] | undefined;
  try {
    allowedLocales = (await getContentLocales()).locales;
  } catch {
    allowedLocales = undefined; // settings unreadable → accept any valid code
  }
  const valid = validateTranslationInput(args, { allowedLocales });
  if (!valid.ok) return { ok: false, errors: valid.errors };
  try {
    const res = await applyTranslation(valid.input);
    if (!res.ok) return { ok: false, errors: res.errors };
    return { ok: true, action: res.action, target: res.target, fields: res.fields };
  } catch (err) {
    return { ok: false, errors: [`failed to translate: ${(err as Error).message}`] };
  }
}

async function handleListAssets(args: unknown): Promise<Record<string, unknown>> {
  try {
    const rows = await listAssets();
    return { ok: true, assets: formatAssetList(rows, coerceLimit(args)) };
  } catch (err) {
    return { ok: false, errors: [`failed to list assets: ${(err as Error).message}`] };
  }
}

async function handleListComponents(): Promise<Record<string, unknown>> {
  try {
    return { ok: true, components: formatComponentList(await listComponents()) };
  } catch (err) {
    return { ok: false, errors: [`failed to list components: ${(err as Error).message}`] };
  }
}

async function handleGetComponent(args: unknown): Promise<Record<string, unknown>> {
  const compName = coerceIdArg(args, "name");
  if (!compName) return { ok: false, errors: ["name is required"] };
  try {
    const row = await getComponentByName(compName);
    if (!row) return { ok: false, errors: [`no component named "${compName}"`] };
    return { ok: true, component: row };
  } catch (err) {
    return { ok: false, errors: [`failed to get component: ${(err as Error).message}`] };
  }
}

async function handleListPages(): Promise<Record<string, unknown>> {
  try {
    return { ok: true, pages: formatPageList(await listPages()) };
  } catch (err) {
    return { ok: false, errors: [`failed to list pages: ${(err as Error).message}`] };
  }
}

async function handleGetPage(args: unknown): Promise<Record<string, unknown>> {
  const id = coerceIdArg(args, "id");
  if (!id) return { ok: false, errors: ["id is required"] };
  try {
    const page = await getPageById(id);
    if (!page) return { ok: false, errors: [`no page with id "${id}"`] };
    return { ok: true, page };
  } catch (err) {
    return { ok: false, errors: [`failed to get page: ${(err as Error).message}`] };
  }
}

async function handleListLocales(): Promise<Record<string, unknown>> {
  try {
    return { ok: true, locales: await getContentLocales() };
  } catch (err) {
    return { ok: false, errors: [`failed to list locales: ${(err as Error).message}`] };
  }
}

async function handleGetBrandIdentity(): Promise<Record<string, unknown>> {
  try {
    return { ok: true, identity: await getSiteIdentity() };
  } catch (err) {
    return { ok: false, errors: [`failed to get brand identity: ${(err as Error).message}`] };
  }
}

async function handleGetTheme(): Promise<Record<string, unknown>> {
  try {
    const [light, dark] = await Promise.all([getThemeOverrides(), getThemeOverridesDark()]);
    return { ok: true, theme: { light, dark } };
  } catch (err) {
    return { ok: false, errors: [`failed to get theme: ${(err as Error).message}`] };
  }
}

async function handleListBuiltinTypes(): Promise<Record<string, unknown>> {
  return { ok: true, builtins: builtinBlockTypes() };
}

/** Update an existing component (same untrusted-artifact gate as create_component). */
async function handleUpdateComponent(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateComponentArtifact(args);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  try {
    const res = await upsertComponent(valid.artifact);
    return { ok: true, action: res.action, component: res.name };
  } catch (err) {
    return { ok: false, errors: [`failed to save component: ${(err as Error).message}`] };
  }
}

/** Replace an existing page's block tree (validateBlocks gate, like the editor). */
async function handleUpdatePageBlocks(args: unknown): Promise<Record<string, unknown>> {
  const id = coerceIdArg(args, "id");
  if (!id) return { ok: false, errors: ["id is required (use list_pages/get_page to find it)"] };
  const blocksArg =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>).blocks
      : undefined;
  const valid = validateBlocks(blocksArg);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  try {
    const missing = await missingComponents(valid.componentNames);
    if (missing.length > 0) {
      return { ok: false, errors: [`unknown components (create them first): ${missing.join(", ")}`] };
    }
    const res = await setPageBlocks(id, valid.blocks);
    if (!res.ok) return { ok: false, errors: res.errors };
    return { ok: true, action: "updated", page: id };
  } catch (err) {
    return { ok: false, errors: [`failed to update page blocks: ${(err as Error).message}`] };
  }
}

/** Update the Site's brand identity (setSiteIdentity is the normalization gate). */
async function handleUpdateBrandIdentity(args: unknown): Promise<Record<string, unknown>> {
  const identity = coerceIdentityArg(args);
  if (identity === undefined) {
    return { ok: false, errors: ["identity must be an object (use get_brand_identity first)"] };
  }
  try {
    const saved = await setSiteIdentity(identity);
    return { ok: true, action: "updated", identity: saved };
  } catch (err) {
    return { ok: false, errors: [`failed to save brand identity: ${(err as Error).message}`] };
  }
}

/** Update the Site's theme overrides (light and/or dark; normalize to known tokens). */
async function handleUpdateTheme(args: unknown): Promise<Record<string, unknown>> {
  const { light, dark, any } = splitThemeArgs(args);
  if (!any) return { ok: false, errors: ["supply 'light' and/or 'dark' as a token→color object"] };
  try {
    const result: Record<string, unknown> = {};
    if (light !== undefined) result.light = await setThemeOverrides(light);
    if (dark !== undefined) result.dark = await setThemeOverridesDark(dark);
    return { ok: true, action: "updated", theme: result };
  } catch (err) {
    return { ok: false, errors: [`failed to save theme: ${(err as Error).message}`] };
  }
}

// ── content-collections (Slice 6): structured collection data tools ───────────
// Each validates the model's args into the exact shape a Slice 2-4 store expects,
// then calls that store (NO forked data path, NO raw SQL to the model). The stores
// return PlanResult<T> ({ok,plan} | {ok:false,status,error}); we map !ok → an error
// payload the model can recover from.

async function handleCreateCollection(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreateCollection(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await createCollection(valid.value.name, valid.value.fields);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "created", collection: res.plan.tableName, name: res.plan.name, fields: res.plan.fields };
  } catch (err) {
    return { ok: false, errors: [`failed to create collection: ${(err as Error).message}`] };
  }
}

async function handleAddCollectionItem(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateAddItem(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await createItem(valid.value.collection, valid.value.values);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "created", item: res.plan };
  } catch (err) {
    return { ok: false, errors: [`failed to add item: ${(err as Error).message}`] };
  }
}

async function handleUpdateCollectionItem(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateUpdateItem(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await updateItem(valid.value.collection, valid.value.id, valid.value.values);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "updated", item: res.plan };
  } catch (err) {
    return { ok: false, errors: [`failed to update item: ${(err as Error).message}`] };
  }
}

async function handleArchiveCollectionItem(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateArchiveItem(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { collection, id, op } = valid.value;
  try {
    const res =
      op === "delete" ? await deleteItem(collection, id)
      : op === "unarchive" ? await unarchiveItem(collection, id)
      : await archiveItem(collection, id);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: op, item: res.plan };
  } catch (err) {
    return { ok: false, errors: [`failed to ${op} item: ${(err as Error).message}`] };
  }
}

async function handleQueryCollection(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateQuery(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await queryCollection(valid.value.collection, valid.value.spec);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, items: res.plan.items, total: res.plan.total, limit: res.plan.limit, offset: res.plan.offset };
  } catch (err) {
    return { ok: false, errors: [`failed to query collection: ${(err as Error).message}`] };
  }
}

// Schema evolution beyond ADD-field: drop/rename a user field via the system-
// generated table rebuild (rebuildCollectionSchema → contentDdlBatch). The planner
// rejects system columns / unknown fields / name collisions; we just shape args.

async function handleDropCollectionField(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateDropField(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await rebuildCollectionSchema(valid.value.collection, { op: "drop", field: valid.value.field });
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "dropped_field", collection: res.plan.tableName, field: valid.value.field, fields: res.plan.fields };
  } catch (err) {
    return { ok: false, errors: [`failed to drop field: ${(err as Error).message}`] };
  }
}

async function handleRenameCollectionField(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateRenameField(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await rebuildCollectionSchema(valid.value.collection, { op: "rename", field: valid.value.field, to: valid.value.to });
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "renamed_field", collection: res.plan.tableName, field: valid.value.field, to: valid.value.to, fields: res.plan.fields };
  } catch (err) {
    return { ok: false, errors: [`failed to rename field: ${(err as Error).message}`] };
  }
}

// ── content-collections (Slice D): component↔collection BINDING tools ─────────
// These mutate a PAGE's draft block tree (NOT a collection store): load the
// blocks, find the target block, validate the binding against the registry + the
// target/template component's propsSchema (the SHARED validateBinding/
// validateListBinding — no forked validation), apply via the Slice-C page-blocks
// helpers, persist via setPageBlocks. Graceful at runtime (the renderer skips
// unresolved), but AUTHORING rejects unknown collection/field/prop so the model
// gets a recoverable message and doesn't author dead bindings.

/** The bound collection's registry fields, or null if it doesn't exist. */
async function collectionFields(table: string) {
  const view = await getCollection(table);
  return view ? view.fields : null;
}

/** A component's declared prop names (the binding allowlist), empty set if absent. */
async function declaredProps(component: string): Promise<Set<string>> {
  const row = await getComponentByName(component);
  return declaredPropNames(row?.propsSchema ?? null);
}

async function handleBindComponent(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateBindComponent(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { page, block } = valid.value;
  try {
    const loaded = await getPageBlocks(page);
    if (!loaded) return { ok: false, errors: [`no page with id "${page}"`] };
    const target = findBlock(loaded.blocks, block);
    if (!target) return { ok: false, errors: [`no block with id "${block}" on this page`] };

    // Clear → drop the "item" binding (revert to static props).
    if (valid.value.clear) {
      const next = setBlockField(loaded.blocks, block, { bindings: undefined });
      const res = await setPageBlocks(page, next);
      if (!res.ok) return { ok: false, errors: res.errors };
      return { ok: true, action: "cleared", page, block };
    }

    const binding = {
      source: { collection: valid.value.collection!, filter: valid.value.filter, sort: valid.value.sort },
      map: valid.value.map!,
    };
    const fields = await collectionFields(valid.value.collection!);
    const declared = await declaredProps(target.component);
    const check = validateBinding(binding, fields, declared);
    if (!check.ok) return { ok: false, errors: check.errors };

    const next = setBlockField(loaded.blocks, block, { bindings: { item: binding } });
    const res = await setPageBlocks(page, next);
    if (!res.ok) return { ok: false, errors: res.errors };
    return { ok: true, action: "bound", page, block, collection: valid.value.collection };
  } catch (err) {
    return { ok: false, errors: [`failed to bind component: ${(err as Error).message}`] };
  }
}

async function handleCreateList(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreateList(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { page, section, collection, template, filter, sort, limit, map } = valid.value;
  try {
    const loaded = await getPageBlocks(page);
    if (!loaded) return { ok: false, errors: [`no page with id "${page}"`] };
    const sectionBlock = findBlock(loaded.blocks, section);
    if (!sectionBlock) return { ok: false, errors: [`no block with id "${section}" on this page`] };
    if (!isSection(sectionBlock)) return { ok: false, errors: [`block "${section}" is not a Section (insert a Section first)`] };

    const listSource = { collection, filter, sort, limit };
    const fields = await collectionFields(collection);
    const declared = await declaredProps(template);
    const check = validateListBinding(listSource, map, fields, declared);
    if (!check.ok) return { ok: false, errors: check.errors };

    // Insert the built-in List, then stamp its query/map + a template child.
    let next = addListToSection(loaded.blocks, section);
    const listId = newListId(loaded.blocks, next);
    next = setBlockField(next, listId, { listSource, listMap: map });
    const tpl: Block = { id: `${listId}-tpl`, component: template, listRole: "template" };
    next = setBlockChildren(next, listId, [tpl]);

    // Renderable check (mirror the page-blocks editor / setPageBlocks contract).
    const shape = validateBlocks(next);
    if (!shape.ok) return { ok: false, errors: shape.errors };

    const res = await setPageBlocks(page, shape.blocks);
    if (!res.ok) return { ok: false, errors: res.errors };
    return { ok: true, action: "created", page, list: listId, collection, template };
  } catch (err) {
    return { ok: false, errors: [`failed to create list: ${(err as Error).message}`] };
  }
}

async function handleBindList(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateBindList(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { page, block } = valid.value;
  try {
    const loaded = await getPageBlocks(page);
    if (!loaded) return { ok: false, errors: [`no page with id "${page}"`] };
    const listBlock = findBlock(loaded.blocks, block);
    if (!listBlock) return { ok: false, errors: [`no block with id "${block}" on this page`] };
    if (!isList(listBlock)) return { ok: false, errors: [`block "${block}" is not a List`] };

    // Merge the patch onto the existing config so partial updates work.
    const prevSource = listBlock.listSource ?? { collection: "" };
    const collection = valid.value.collection ?? prevSource.collection;
    if (!collection) return { ok: false, errors: ["this list has no collection yet — pass `collection`"] };
    const listSource = {
      collection,
      filter: valid.value.filter ?? prevSource.filter,
      sort: valid.value.sort ?? prevSource.sort,
      limit: valid.value.limit ?? prevSource.limit,
    };
    const listMap = valid.value.map ?? listBlock.listMap ?? {};

    // Template: the existing template child's component, unless replacing it.
    const prevTpl = (listBlock.children ?? []).find((c) => c.listRole !== "empty");
    const template = valid.value.template ?? prevTpl?.component;
    if (!template) return { ok: false, errors: ["this list has no template yet — pass `template`"] };

    const fields = await collectionFields(collection);
    const declared = await declaredProps(template);
    const check = validateListBinding(listSource, listMap, fields, declared);
    if (!check.ok) return { ok: false, errors: check.errors };

    let next = setBlockField(loaded.blocks, block, { listSource, listMap });
    // Replace the template component if requested, preserving any empty-state child.
    if (valid.value.template) {
      const emptyChild = (listBlock.children ?? []).find((c) => c.listRole === "empty");
      const tpl: Block = { id: `${block}-tpl`, component: template, listRole: "template" };
      next = setBlockChildren(next, block, emptyChild ? [tpl, emptyChild] : [tpl]);
    }

    const shape = validateBlocks(next);
    if (!shape.ok) return { ok: false, errors: shape.errors };
    const res = await setPageBlocks(page, shape.blocks);
    if (!res.ok) return { ok: false, errors: res.errors };
    return { ok: true, action: "bound", page, list: block, collection, template };
  } catch (err) {
    return { ok: false, errors: [`failed to bind list: ${(err as Error).message}`] };
  }
}

// ── System-prompt version CRUD ────────────────────────────────────────────────
// Manage saved system-prompt versions (the named full prompts an operator keeps
// to compare). Storing/editing a version NEVER changes the site's active default
// — selecting one to actually use is the chat route's per-request override path.

async function handleListPrompts(): Promise<Record<string, unknown>> {
  try {
    return { ok: true, prompts: await listPromptVersions() };
  } catch (err) {
    return { ok: false, errors: [`failed to list prompts: ${(err as Error).message}`] };
  }
}

async function handleCreatePrompt(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreatePrompt(args);
  if ("error" in valid) return { ok: false, errors: [valid.error] };
  try {
    const prompt = await createPromptVersion(valid);
    return { ok: true, action: "created", prompt };
  } catch (err) {
    return { ok: false, errors: [`failed to create prompt: ${(err as Error).message}`] };
  }
}

async function handleUpdatePrompt(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateUpdatePrompt(args);
  if ("error" in valid) return { ok: false, errors: [valid.error] };
  try {
    const prompt = await updatePromptVersion(valid.id, { label: valid.label, prompt: valid.prompt });
    if (!prompt) return { ok: false, errors: [`no prompt version with id "${valid.id}"`] };
    return { ok: true, action: "updated", prompt };
  } catch (err) {
    return { ok: false, errors: [`failed to update prompt: ${(err as Error).message}`] };
  }
}

async function handleDeletePrompt(args: unknown): Promise<Record<string, unknown>> {
  const id = coercePromptId(args);
  if (!id) return { ok: false, errors: ["id is required"] };
  try {
    await deletePromptVersion(id);
    return { ok: true, action: "deleted", id };
  } catch (err) {
    return { ok: false, errors: [`failed to delete prompt: ${(err as Error).message}`] };
  }
}

// ── edit_text: string-replace patch of a long-text field ──────────────────────
// Load the targeted field, apply the snippet edit (apply-edit's cascading
// matchers + safety rails), re-validate where needed, and persist. Never rewrites
// the whole field; an ambiguous/absent oldString returns a recoverable error.

async function handleEditText(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateEditText(args);
  if ("error" in valid) return { ok: false, errors: [valid.error] };
  const { target, selector, oldString, newString, replaceAll } = valid;

  try {
    if (target === "component.script" || target === "component.css") {
      const row = await getComponentByName(selector);
      if (!row) return { ok: false, errors: [`no component named "${selector}"`] };
      const field = target === "component.script" ? "script" : "css";
      const current = (row[field] as string) ?? "";
      const edit = applyEdit(current, oldString, newString, replaceAll);
      if (!edit.ok) return { ok: false, errors: [edit.error] };

      // Re-pass the FULL artifact through the same validate gate as create/update
      // (tree comes back as a JSON string from D1 → parse to the object shape).
      let tree: unknown;
      try {
        tree = JSON.parse(row.tree as string);
      } catch {
        return { ok: false, errors: ["stored component tree is not valid JSON; use update_component"] };
      }
      const artifact = {
        name: row.name,
        tree,
        script: field === "script" ? edit.content : ((row.script as string) ?? ""),
        css: field === "css" ? edit.content : ((row.css as string) ?? ""),
      };
      const checked = validateComponentArtifact(artifact);
      if (!checked.ok) return { ok: false, errors: checked.errors };
      const res = await upsertComponent(checked.artifact);
      return { ok: true, action: "edited", target, component: res.name, replacements: edit.replacements, matcher: edit.matcher };
    }

    // prompt.prompt
    const version = await getPromptVersion(selector);
    if (!version) return { ok: false, errors: [`no prompt version with id "${selector}"`] };
    const edit = applyEdit(version.prompt, oldString, newString, replaceAll);
    if (!edit.ok) return { ok: false, errors: [edit.error] };
    const updated = await updatePromptVersion(selector, { prompt: edit.content });
    if (!updated) return { ok: false, errors: [`no prompt version with id "${selector}"`] };
    return { ok: true, action: "edited", target, prompt: updated, replacements: edit.replacements, matcher: edit.matcher };
  } catch (err) {
    return { ok: false, errors: [`failed to edit text: ${(err as Error).message}`] };
  }
}

/** The id of the List just appended by addListToSection (the new block in `after`). */
function newListId(before: Block[], after: Block[]): string {
  const had = new Set<string>();
  const collect = (bs: Block[]) => bs.forEach((b) => { had.add(b.id); if (b.children) collect(b.children); });
  collect(before);
  let found = "";
  const scan = (bs: Block[]) => bs.forEach((b) => {
    if (!had.has(b.id) && b.component === LIST_COMPONENT) found = b.id;
    if (b.children) scan(b.children);
  });
  scan(after);
  return found;
}

// ── The handler map + dispatcher ──────────────────────────────────────────────
// Keyed by tool name (== function.name == TOOL_BY_NAME key). Read tools ignore
// args; we wrap the no-arg handlers so every entry is `(args) => Promise<…>`.
const HANDLERS: Record<ToolName, ToolHandler> = {
  create_component: handleCreateComponent,
  create_page: handleCreatePage,
  translate: handleTranslate,
  list_assets: handleListAssets,
  list_components: () => handleListComponents(),
  get_component: handleGetComponent,
  list_pages: () => handleListPages(),
  get_page: handleGetPage,
  list_locales: () => handleListLocales(),
  get_brand_identity: () => handleGetBrandIdentity(),
  get_theme: () => handleGetTheme(),
  list_builtin_types: () => handleListBuiltinTypes(),
  update_component: handleUpdateComponent,
  update_page_blocks: handleUpdatePageBlocks,
  update_brand_identity: handleUpdateBrandIdentity,
  update_theme: handleUpdateTheme,
  create_collection: handleCreateCollection,
  add_collection_item: handleAddCollectionItem,
  update_collection_item: handleUpdateCollectionItem,
  archive_collection_item: handleArchiveCollectionItem,
  query_collection: handleQueryCollection,
  drop_collection_field: handleDropCollectionField,
  rename_collection_field: handleRenameCollectionField,
  bind_component: handleBindComponent,
  create_list: handleCreateList,
  bind_list: handleBindList,
  list_prompts: () => handleListPrompts(),
  create_prompt: handleCreatePrompt,
  update_prompt: handleUpdatePrompt,
  delete_prompt: handleDeletePrompt,
  edit_text: handleEditText,
};

/**
 * Run ONE tool call → structured `{name, ok, …}` result. Used by the chat route's
 * tool round and (Slice 3) the MCP `tools/call`. Unknown tool or a thrown handler
 * → `{ok:false, errors}`; never throws.
 */
export const runTool: (name: string, args: unknown) => Promise<DispatchResult> =
  makeDispatcher(HANDLERS as Record<string, ToolHandler>);
