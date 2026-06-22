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
import { validateBlocks } from "@/lib/pages/page-blocks";
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
  setPageBlocks,
} from "@/db/page-store";
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
};

/**
 * Run ONE tool call → structured `{name, ok, …}` result. Used by the chat route's
 * tool round and (Slice 3) the MCP `tools/call`. Unknown tool or a thrown handler
 * → `{ok:false, errors}`; never throws.
 */
export const runTool: (name: string, args: unknown) => Promise<DispatchResult> =
  makeDispatcher(HANDLERS as Record<string, ToolHandler>);
