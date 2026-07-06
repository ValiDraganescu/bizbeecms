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
import { LIST_ASSETS_TOOL, DEFAULT_ASSET_LIMIT, MAX_ASSET_LIMIT, formatAssetList } from "./list-assets-tool";
import { coercePageArgs, pagedResult } from "./paging";
import {
  LIST_COMPONENTS_TOOL,
  GET_COMPONENT_TOOL,
  LIST_PAGES_TOOL,
  GET_PAGE_TOOL,
  LIST_LOCALES_TOOL,
  SEARCH_ICONS_TOOL,
  GET_BRAND_IDENTITY_TOOL,
  GET_THEME_TOOL,
  GET_AUTHORING_GUIDE_TOOL,
  coerceIdArg,
  coerceGuideArg,
  formatComponentList,
  formatPageList,
} from "./read-tools";
import { assembleSystemPrompt } from "./assemble-prompt";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { putAsset, setAssetTags } from "@/db/asset-store";
import { buildAssetKey, assetUrl, filenameFromText } from "@/lib/render/asset";
import { effectiveOpenrouterKey } from "@/lib/settings/openrouter-key";
import { getDecryptedOpenrouterUserKey } from "@/db/openrouter-key-store";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_GEN_MODEL,
} from "@/lib/chat/models";
import {
  UPDATE_COMPONENT_TOOL,
  UPDATE_PAGE_BLOCKS_TOOL,
  SET_BLOCK_PROPS_TOOL,
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
  ADD_COLLECTION_FIELD_TOOL,
  DROP_COLLECTION_FIELD_TOOL,
  RENAME_COLLECTION_FIELD_TOOL,
  validateCreateCollection,
  validateAddItem,
  validateUpdateItem,
  validateArchiveItem,
  validateQuery,
  validateAddField,
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
  LIST_DATA_SOURCES_TOOL,
  CREATE_DATA_SOURCE_TOOL,
  TEST_DATA_SOURCE_TOOL,
  validateCreateDataSource,
  validateTestDataSource,
  formatSource,
  sampleForModel,
} from "./data-source-tools";
import {
  CREATE_FORM_TOOL,
  BIND_FORM_TOOL,
  validateCreateForm,
  validateBindForm,
  mergeFormTarget,
} from "./form-tools";
import {
  GET_DATA_SOURCES_GUIDE_TOOL,
  DATA_SOURCES_GUIDE,
} from "./data-sources-guide";
import {
  listDataSources,
  createDataSource,
  createDataSourceRequest,
  listDataSourceRequests,
  decryptSourceSecret,
  type SafeDataSource,
  type SafeDataSourceRequest,
} from "@/db/data-source-store";
import { fetchSource } from "@/lib/data-sources/fetch";
import { samplePaths } from "@/lib/data-sources/bind";
import {
  requestPlaceholders,
  type AuthType,
  type HttpMethod,
} from "@/lib/data-sources/validate";
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
import { GENERATE_IMAGE_TOOL, validateGenerateImage } from "./generate-image-tool";
import { generateImage } from "./generate-image";
import { withWhiteBackgroundInstruction } from "./cutout";
import { removeBackgroundFromPng } from "./png-cutout";
import { describeImage } from "./describe-image";
import { applyEdit } from "./apply-edit";
import { reconcileComponentClasses } from "./reconcile-classes";
import { lintComponentScript } from "./lint-component-script";
import {
  validateBlocks,
  topLevelBlockIds,
  findBlock,
  mergeBlockProps,
  patchBlockProps,
  validateBlockProps,
  parsePropsSchema,
  setBlockField,
  setBlockChildren,
  addListToSection,
  addFormToSection,
  isList,
  isForm,
  isSection,
  LIST_COMPONENT,
  FORM_COMPONENT,
} from "@/lib/pages/page-blocks";
import type { Block, TreeNode, BindingRef, ListSource, FormTarget } from "@/lib/render/tree";
import { treeToHtml } from "@/lib/render/parse-html";
import { effectiveTheme } from "@/lib/render/theme";
import { FONT_SLOTS } from "@/lib/render/fonts";
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
} from "@/db/page-store";
import { getDraft, saveDraftBlocks } from "@/db/page-version-store";
import { getCollection, listCollections, rebuildCollectionSchema } from "@/db/collection-store";
import { applyTranslation } from "@/db/translate-store";
import {
  getContentLocales,
  getSiteIdentity,
  getThemeFonts,
  getThemeOverrides,
  getThemeOverridesDark,
  setSiteIdentity,
  setThemeOverrides,
  setThemeOverridesDark,
  getImageModel,
  getImageGenModel,
  getIconSet,
} from "@/db/settings-store";
import { searchIcons } from "@/db/icon-store";
import { listAssets } from "@/db/asset-store";
import { createCollection, addCollectionField } from "@/db/collection-store";
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
import { localeSlugConflicts } from "@/lib/render/localize";

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
  search_icons: SEARCH_ICONS_TOOL,
  get_brand_identity: GET_BRAND_IDENTITY_TOOL,
  get_theme: GET_THEME_TOOL,
  list_builtin_types: LIST_BUILTIN_TYPES_TOOL,
  update_component: UPDATE_COMPONENT_TOOL,
  update_page_blocks: UPDATE_PAGE_BLOCKS_TOOL,
  set_block_props: SET_BLOCK_PROPS_TOOL,
  update_brand_identity: UPDATE_BRAND_IDENTITY_TOOL,
  update_theme: UPDATE_THEME_TOOL,
  create_collection: CREATE_COLLECTION_TOOL,
  add_collection_item: ADD_COLLECTION_ITEM_TOOL,
  update_collection_item: UPDATE_COLLECTION_ITEM_TOOL,
  archive_collection_item: ARCHIVE_COLLECTION_ITEM_TOOL,
  query_collection: QUERY_COLLECTION_TOOL,
  add_collection_field: ADD_COLLECTION_FIELD_TOOL,
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
  get_authoring_guide: GET_AUTHORING_GUIDE_TOOL,
  generate_image: GENERATE_IMAGE_TOOL,
  list_data_sources: LIST_DATA_SOURCES_TOOL,
  create_data_source: CREATE_DATA_SOURCE_TOOL,
  test_data_source: TEST_DATA_SOURCE_TOOL,
  create_form: CREATE_FORM_TOOL,
  bind_form: BIND_FORM_TOOL,
  get_data_sources_guide: GET_DATA_SOURCES_GUIDE_TOOL,
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
  // The script is being authored HERE, so script↔markup findings block: a
  // static selector matching nothing this component renders/builds is either
  // a cross-component reach or dead code — both fixable by the model now.
  const scriptFindings = lintComponentScript(valid.artifact.tree, valid.artifact.script);
  if (scriptFindings.length > 0) return { ok: false, errors: scriptFindings };
  try {
    const res = await upsertComponent(valid.artifact);
    // Quality nits (unknown html classes, dead css rules) ride back as
    // non-blocking warnings so the model can clean up in its next call.
    const warnings = await reconcileComponentClasses(
      valid.artifact.tree,
      valid.artifact.css,
      valid.artifact.script,
    );
    return {
      ok: true,
      action: res.action,
      component: res.name,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
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
      return { ok: false, errors: [await unknownComponentMessage(missing)] };
    }
    // A top-level slug equal to a content-locale code would be shadowed by the
    // /<code>/ locale URL prefix (Stage 1 locale-prefix routing) — same guard
    // as the /api/pages REST route.
    if (valid.page.parentSlug === null) {
      const { locales } = await getContentLocales();
      const clash = localeSlugConflicts(locales, [valid.page.slug]);
      if (clash.length > 0) {
        return {
          ok: false,
          errors: [
            `slug "${valid.page.slug}" equals the configured content-locale code "${clash[0]}" — the /${clash[0]}/ locale prefix would shadow this page; choose a different top-level slug`,
          ],
        };
      }
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
    return pagedResult(
      "assets",
      formatAssetList(rows),
      coercePageArgs(args, DEFAULT_ASSET_LIMIT, MAX_ASSET_LIMIT),
    );
  } catch (err) {
    return { ok: false, errors: [`failed to list assets: ${(err as Error).message}`] };
  }
}

async function handleListComponents(args: unknown): Promise<Record<string, unknown>> {
  try {
    return pagedResult("components", formatComponentList(await listComponents()), coercePageArgs(args));
  } catch (err) {
    return { ok: false, errors: [`failed to list components: ${(err as Error).message}`] };
  }
}

async function handleGetComponent(args: unknown): Promise<Record<string, unknown>> {
  const compName = coerceIdArg(args, "name");
  if (!compName) return { ok: false, errors: ["name is required"] };
  try {
    // preferDraft: the model reads (and then re-edits) the pending DRAFT so
    // iterating doesn't clobber an unpublished edit with a live-based rewrite.
    const row = await getComponentByName(compName, true);
    if (!row) return { ok: false, errors: [`no component named "${compName}"`] };
    // The model authors in Handlebars-HTML; show it the markup as `html`, not the
    // internal JSON tree (the row carries `tree` as a JSON string for storage).
    let html = "";
    try {
      html = treeToHtml(JSON.parse(row.tree as string) as TreeNode);
    } catch {
      /* corrupt stored markup → empty; update_component will re-author it */
    }
    return {
      ok: true,
      component: {
        name: row.name,
        html,
        script: row.script,
        css: row.css,
        propsSchema: row.propsSchema,
        tags: row.tags,
      },
    };
  } catch (err) {
    return { ok: false, errors: [`failed to get component: ${(err as Error).message}`] };
  }
}

async function handleListPages(args: unknown): Promise<Record<string, unknown>> {
  try {
    return pagedResult("pages", formatPageList(await listPages()), coercePageArgs(args));
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
    // Include the DRAFT block tree (what the editor/canvas show + the AI edits):
    // each block's component + props, so the model sees what's rendered and with
    // which values. NOT the components' html/js/css — those are implementation.
    const draft = await getDraftBlocks(id);
    return { ok: true, page, blocks: draft?.blocks ?? [] };
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

async function handleSearchIcons(args: unknown): Promise<Record<string, unknown>> {
  const query = coerceIdArg(args, "query");
  if (!query) return { ok: false, errors: ["search_icons needs a non-empty `query`"] };
  const rawLimit =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>).limit
      : undefined;
  const limit = typeof rawLimit === "number" && rawLimit > 0 ? Math.min(100, rawLimit) : 48;
  try {
    const set = await getIconSet();
    const names = await searchIcons(set, query, limit);
    // Return the set so the model knows which library these names resolve against.
    return { ok: true, set, icons: names };
  } catch (err) {
    return { ok: false, errors: [`failed to search icons: ${(err as Error).message}`] };
  }
}

async function handleGetTheme(): Promise<Record<string, unknown>> {
  try {
    const [light, dark, fonts] = await Promise.all([
      getThemeOverrides(),
      getThemeOverridesDark(),
      getThemeFonts(),
    ]);
    // Return the EFFECTIVE theme (defaults + overrides) so the model sees the
    // real color of every token — an empty override map is the DEFAULT theme,
    // not "no theme". `overrides` keeps the diff for when it wants to know what
    // the operator explicitly changed.
    return {
      ok: true,
      theme: {
        light: effectiveTheme(light, false),
        dark: effectiveTheme(dark, true),
      },
      overrides: { light, dark },
      // Font SLOTS (theme-fonts): which family backs font-body / font-heading /
      // font-accent. Unset slot = system default. Read-only here — families
      // are picked in Theme settings (the save self-hosts the files).
      fonts: Object.fromEntries(
        FONT_SLOTS.map((s) => [s, fonts.slots[s]?.family ?? null]),
      ),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to get theme: ${(err as Error).message}`] };
  }
}

async function handleListBuiltinTypes(): Promise<Record<string, unknown>> {
  return { ok: true, builtins: builtinBlockTypes() };
}

/** Return the built-in authoring guide (full system prompt) for the chosen context. */
async function handleGetAuthoringGuide(args: unknown): Promise<Record<string, unknown>> {
  const guide = coerceGuideArg(args);
  try {
    return { ok: true, guide, prompt: await assembleSystemPrompt(guide) };
  } catch (err) {
    return { ok: false, errors: [`failed to assemble authoring guide: ${(err as Error).message}`] };
  }
}

/**
 * Resolve the effective OpenRouter key the SAME way the chat + describe routes do
 * (CMS-local user key beats the deployer env key), reading the Worker env via the
 * CF context. Returns "" when no key/context — callers treat that as "AI disabled".
 */
async function resolveOpenrouterKey(): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as { OPENROUTER_API_KEY?: string; CMS_AUTH_SECRET?: string };
    let userKey: string | null = null;
    if (typeof e.CMS_AUTH_SECRET === "string" && e.CMS_AUTH_SECRET) {
      try {
        userKey = await getDecryptedOpenrouterUserKey(e.CMS_AUTH_SECRET);
      } catch {
        userKey = null;
      }
    }
    return effectiveOpenrouterKey(userKey, e.OPENROUTER_API_KEY);
  } catch {
    return "";
  }
}

/** Base64-encode an ArrayBuffer (Worker-safe; chunked to avoid arg-count limits). */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Generate an image from a text prompt and run it through the SAME pipeline an
 * upload uses: write bytes to R2 + a D1 asset row, describe it for search (vision
 * model), and apply the model's tags. Returns the new asset's public `/media/<key>`
 * URL so the assistant can drop it straight into a component/page.
 *
 * Each external step degrades gracefully: a describe failure still yields a usable
 * asset (empty description, like upload); only a generation failure or R2 write
 * error is a hard error the model can recover from.
 */
async function handleGenerateImage(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateGenerateImage(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };

  const key = await resolveOpenrouterKey();
  if (!key) {
    return { ok: false, errors: ["no OpenRouter key configured — set one in Settings → OpenRouter key"] };
  }

  // The image-GENERATION model (operator-selected; falls back to the default).
  const genModel = (await getImageGenModel()) || DEFAULT_IMAGE_GEN_MODEL;
  // For a transparent cut-out: tell the model to render on a flat white background
  // (so the flood-fill has a clean key), then strip it after generation below.
  const genPrompt = valid.transparentBackground
    ? withWhiteBackgroundInstruction(valid.prompt)
    : valid.prompt;
  let image;
  try {
    image = await generateImage(genPrompt, genModel, key);
  } catch (err) {
    return { ok: false, errors: [`image generation failed: ${(err as Error).message}`] };
  }
  if (!image) {
    return {
      ok: false,
      errors: [
        `the model "${genModel}" returned no image. Check the image-generation model in ` +
          `Settings → Media (it must support image output).`,
      ],
    };
  }

  // Background removal (transparent cut-out). Only meaningful for PNG (the alpha
  // channel + our pure-JS codec); the gen model returns PNG. Degrades to the
  // original bytes on any failure — a cut-out miss shouldn't fail the whole call.
  if (valid.transparentBackground && image.contentType === "image/png") {
    image = { bytes: removeBackgroundFromPng(image.bytes), contentType: "image/png" };
  }

  // Same describe step as upload (vision model on the generated bytes, for search).
  // A failure returns "" and never blocks the asset, mirroring the upload path.
  const dataUrl = `data:${image.contentType};base64,${bufferToBase64(image.bytes)}`;
  let description = "";
  try {
    const describeModel = (await getImageModel()) || DEFAULT_IMAGE_MODEL;
    description = await describeImage(dataUrl, describeModel, key);
  } catch {
    description = "";
  }

  try {
    // Filename = 2–5 meaningful words from the AI description (prompt when
    // describe failed) so the gallery shows what the image IS, not "generated".
    const filename = filenameFromText(
      description || valid.prompt,
      image.contentType.split("/")[1] ?? "png",
    );
    const assetKey = buildAssetKey(filename, image.contentType, crypto.randomUUID().slice(0, 8));
    const row = await putAsset({
      key: assetKey,
      filename,
      contentType: image.contentType,
      bytes: image.bytes,
      description,
    });
    // Apply the model's tags (best-effort; the asset already exists either way).
    if (valid.tags.length > 0) {
      try {
        await setAssetTags(row.key, valid.tags);
      } catch {
        /* tag write is best-effort */
      }
    }
    return {
      ok: true,
      action: "generated",
      url: assetUrl(row.key),
      key: row.key,
      description,
      tags: valid.tags,
      model: genModel,
    };
  } catch (err) {
    return { ok: false, errors: [`failed to save generated image: ${(err as Error).message}`] };
  }
}

/** Update an existing component (same untrusted-artifact gate as create_component). */
async function handleUpdateComponent(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateComponentArtifact(args);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  // Full re-author = the model owns the whole script; findings block (see create).
  const scriptFindings = lintComponentScript(valid.artifact.tree, valid.artifact.script);
  if (scriptFindings.length > 0) return { ok: false, errors: scriptFindings };
  try {
    const res = await upsertComponent(valid.artifact);
    const warnings = await reconcileComponentClasses(
      valid.artifact.tree,
      valid.artifact.css,
      valid.artifact.script,
    );
    return {
      ok: true,
      action: res.action,
      component: res.name,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to save component: ${(err as Error).message}`] };
  }
}

// The AI page tools read+write the page's DRAFT version — the SAME store the
// Page Builder editor and the preview iframe use (`/api/pages/[id]/draft` →
// saveDraftBlocks). Writing legacy `page.blocks` instead made AI edits invisible
// in the builder (the draft-based preview never reads page.blocks). These two
// helpers mirror getPageBlocks/setPageBlocks against the draft.

/** Read the page's draft blocks (create-if-absent), or null if the page is gone. */
async function getDraftBlocks(
  pageId: string,
): Promise<{ id: string; blocks: Block[]; meta: string } | null> {
  const draft = await getDraft(pageId);
  if (!draft) return null;
  let blocks: Block[];
  try {
    blocks = JSON.parse(draft.blocks) as Block[];
  } catch {
    blocks = [];
  }
  return { id: pageId, blocks, meta: draft.meta };
}

/**
 * Persist blocks to the page's draft version (the editor's write path). Preserves
 * the draft's existing `meta` — the blocks editor never changes meta, so neither
 * do we (pass the meta read alongside the blocks via getDraftBlocks).
 */
async function setDraftBlocks(
  pageId: string,
  blocks: Block[],
  meta: string,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const saved = await saveDraftBlocks(pageId, { blocks: JSON.stringify(blocks), meta });
  return saved ? { ok: true } : { ok: false, errors: ["page not found"] };
}

/** Every block id in a tree (depth-first) — for a "no such block, here are the ids" error. */
function collectBlockIds(blocks: Block[]): string[] {
  const out: string[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b?.id) out.push(b.id);
      if (b?.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/** Replace an existing page's block tree (validateBlocks gate, like the editor). */
async function handleUpdatePageBlocks(args: unknown): Promise<Record<string, unknown>> {
  const id = coerceIdArg(args, "id");
  if (!id) return { ok: false, errors: ["id is required (use list_pages/get_page to find it)"] };
  const blocksArg =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>).blocks
      : undefined;
  const draft = await getDraftBlocks(id);
  if (!draft) return { ok: false, errors: ["page not found"] };
  // Grandfather the page's already-saved top-level blocks (top-level = Sections
  // only rejects NEW non-Section strays).
  const valid = validateBlocks(blocksArg, {
    grandfatheredTopLevelIds: topLevelBlockIds(draft.blocks),
  });
  if (!valid.ok) return { ok: false, errors: valid.errors };
  try {
    const missing = await missingComponents(valid.componentNames);
    if (missing.length > 0) {
      return { ok: false, errors: [await unknownComponentMessage(missing)] };
    }
    const res = await setDraftBlocks(id, valid.blocks, draft.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return { ok: true, action: "updated", page: id };
  } catch (err) {
    return { ok: false, errors: [`failed to update page blocks: ${(err as Error).message}`] };
  }
}

/**
 * Patch ONE block's props by id — the SAFE per-block content edit (it can't drop
 * the rest of the tree the way a full update_page_blocks re-pass can). Loads the
 * draft, finds the block, MERGES the patch into its existing props (empty string
 * clears a prop), validates against the component's propsSchema (same gate the
 * editor uses), and saves. Built-in blocks (Section/List) carry no propsSchema, so
 * their props pass through the legacy allowlist path unchanged.
 */
async function handleSetBlockProps(args: unknown): Promise<Record<string, unknown>> {
  const id = coerceIdArg(args, "id");
  if (!id) return { ok: false, errors: ["id is required (the page id, from list_pages/get_page)"] };
  const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
  const blockId = typeof a.blockId === "string" ? a.blockId : "";
  if (!blockId) return { ok: false, errors: ["blockId is required (every block in get_page has an `id`)"] };
  if (typeof a.props !== "object" || a.props === null || Array.isArray(a.props)) {
    return { ok: false, errors: ["props must be an object, e.g. { title: 'New title' }"] };
  }
  const patch = a.props as Record<string, unknown>;
  try {
    const loaded = await getDraftBlocks(id);
    if (!loaded) return { ok: false, errors: [`no page with id "${id}"`] };
    const target = findBlock(loaded.blocks, blockId);
    if (!target) {
      const ids = collectBlockIds(loaded.blocks);
      return {
        ok: false,
        errors: [
          `no block with id "${blockId}" on this page. Block ids: ${ids.join(", ") || "(none)"}`,
        ],
      };
    }

    const row = await getComponentByName(target.component);
    const schema = parsePropsSchema(row?.propsSchema ?? null);
    const editable = schema.map((f) => f.name);

    // An EMPTY patch changes nothing — do NOT report success (that invites a retry
    // loop). Name the props the model could actually set so it self-corrects.
    if (Object.keys(patch).length === 0) {
      return {
        ok: false,
        errors: [
          `props was empty — nothing to change. Pass the values to set, e.g. ` +
            `{ "props": { "title": "…" } }.` +
            (editable.length ? ` Editable props on ${target.component}: ${editable.join(", ")}.` : ""),
        ],
      };
    }

    // Merge the patch over the block's current props; an empty string clears a key.
    const merged = patchBlockProps(target.props, patch);
    // Validate against the component's own schema (drop undeclared keys, coerce by
    // type) — the same gate the editor's field path uses. A built-in/schemaless
    // block has NO propsSchema; the schema-aware path would drop everything, so we
    // keep the merged props verbatim there (Section/List config isn't this tool's
    // job, but we must not silently nuke it).
    const validated = schema.length > 0 ? validateBlockProps(merged, schema) : merged;

    // If NO supplied key survived validation as a known prop, it's a no-op (the
    // model used wrong prop names). Tell it which keys were rejected and what IS
    // settable — don't report a false success. (We test key SURVIVAL, not value
    // equality: validateBlockProps coerces values, e.g. "12" → 12, so a kept prop
    // legitimately differs from the raw patch.) `width` is a reserved layout prop
    // the validator keeps even when not in the schema — count it as known.
    if (schema.length > 0) {
      const known = new Set([...editable, "width"]);
      const anyKnown = Object.keys(patch).some((k) => known.has(k));
      if (!anyKnown) {
        return {
          ok: false,
          errors: [
            `none of [${Object.keys(patch).join(", ")}] are props of ${target.component}. ` +
              `Editable props: ${editable.join(", ") || "(none)"}.`,
          ],
        };
      }
    }

    const next = mergeBlockProps(loaded.blocks, blockId, validated);
    const res = await setDraftBlocks(id, next, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return { ok: true, action: "updated", page: id, block: blockId, props: validated };
  } catch (err) {
    return { ok: false, errors: [`failed to set block props: ${(err as Error).message}`] };
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
    // `collectionName`, not `name` — top-level `name` is reserved for the tool name.
    return { ok: true, action: "created", collection: res.plan.tableName, collectionName: res.plan.name, fields: res.plan.fields };
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
  // Be proactive: if the named collection doesn't exist, tell the model the
  // EXACT available table names (+ their fields) so it can retry without guessing
  // (the common failure: guessing `restaurants` for `content_restaurants`).
  const requested = valid.value.collection;
  if (!(await getCollection(requested))) {
    return { ok: false, errors: [await unknownCollectionMessage(requested)] };
  }
  try {
    const res = await queryCollection(requested, valid.value.spec);
    if (!res.ok) return { ok: false, errors: [res.error] };
    const { items, total, limit, offset } = res.plan;
    const out: Record<string, unknown> = { ok: true, items, total, limit, offset };
    if (offset + items.length < total) {
      out.hint = `showing ${items.length} of ${total} — more available; call again with offset=${offset + items.length} (or raise limit, max 1000)`;
    }
    return out;
  } catch (err) {
    return { ok: false, errors: [`failed to query collection: ${(err as Error).message}`] };
  }
}

/** Actionable "unknown component" error: name the missing ones + list what exists. */
async function unknownComponentMessage(missing: string[]): Promise<string> {
  let existing: string[] = [];
  try {
    existing = (await listComponents()).map((c) => c.name);
  } catch {
    /* unbound D1 */
  }
  const have = existing.length > 0
    ? ` Existing components you can use: ${existing.join(", ")}.`
    : " This Site has no components yet.";
  return (
    `These components don't exist (create them with create_component first, ` +
    `BEFORE referencing them in a page): ${missing.join(", ")}.${have}`
  );
}

/** Actionable "no such collection" error: name the requested one + list real ones. */
async function unknownCollectionMessage(requested: string): Promise<string> {
  const cols = await listCollections();
  if (cols.length === 0) {
    return `Collection "${requested}" does not exist, and this Site has no collections yet. Create one with create_collection before querying.`;
  }
  const list = cols
    .map((c) => `${c.tableName} (${c.fields.map((f) => f.name).join(", ") || "no user fields"})`)
    .join("; ");
  return (
    `Collection "${requested}" does not exist. Use one of these exact table names: ${list}. ` +
    `Collection tables are prefixed "content_" — pass the full table name (e.g. content_restaurants), not the bare label.`
  );
}

// Schema evolution beyond ADD-field: drop/rename a user field via the system-
// generated table rebuild (rebuildCollectionSchema → contentDdlBatch). The planner
// rejects system columns / unknown fields / name collisions; we just shape args.

async function handleAddCollectionField(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateAddField(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await addCollectionField(valid.value.collection, valid.value.field);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "added_field", collection: res.plan.tableName, field: valid.value.field.name, fields: res.plan.fields };
  } catch (err) {
    return { ok: false, errors: [`failed to add field: ${(err as Error).message}`] };
  }
}

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

// ── external-data-sources (Slice 6): external API data-source tools ───────────
// Same discipline as the collection tools: pure validation in
// data-source-tools.ts, store/fetch effects here. Secrets are WRITE-ONLY — a
// tool may SET one (encrypted via the Worker's CMS_AUTH_SECRET KEK) but no tool
// result ever contains it. test_data_source mirrors the Slice-4 test endpoint:
// live fetch, cache BYPASSED, secret injected server-side.

/** The secret-box KEK from the Worker env ("" when unavailable, e.g. node tests). */
async function kekFromEnv(): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as { CMS_AUTH_SECRET?: string };
    return typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
  } catch {
    return "";
  }
}

type ResolvedSourceRequest =
  | { ok: true; source: SafeDataSource; request: SafeDataSourceRequest }
  | { ok: false; error: string };

/**
 * Resolve a source + saved request from the model's refs (id OR name), with
 * self-correcting errors that list what actually exists (AI error philosophy).
 */
async function resolveSourceAndRequest(
  sourceRef: string,
  requestRef: string,
): Promise<ResolvedSourceRequest> {
  const sources = await listDataSources();
  const source =
    sources.find((s) => s.id === sourceRef) ?? sources.find((s) => s.name === sourceRef);
  if (!source) {
    if (sources.length === 0) {
      return { ok: false, error: `no data source "${sourceRef}" — this site has no API data sources yet (create one with create_data_source)` };
    }
    const names = sources.map((s) => `${s.name} (${s.id})`).join(", ");
    return { ok: false, error: `no data source "${sourceRef}". Available sources: ${names}` };
  }
  const requests = await listDataSourceRequests(source.id);
  const request =
    requests.find((r) => r.id === requestRef) ?? requests.find((r) => r.name === requestRef);
  if (!request) {
    if (requests.length === 0) {
      return { ok: false, error: `source "${source.name}" has no saved requests yet — add one (create_data_source with \`requests\`, or the operator via Data Sources)` };
    }
    const names = requests.map((r) => `${r.name} (${r.id})`).join(", ");
    return { ok: false, error: `no saved request "${requestRef}" on source "${source.name}". Available requests: ${names}` };
  }
  return { ok: true, source, request };
}

async function handleListDataSources(args: unknown): Promise<Record<string, unknown>> {
  try {
    // Page the raw source rows first, then fetch saved requests only for the
    // page (not the whole store), and swap the shaped items into the result.
    const res = pagedResult("sources", await listDataSources(), coercePageArgs(args));
    const shaped: Record<string, unknown>[] = [];
    for (const s of res.sources as Awaited<ReturnType<typeof listDataSources>>) {
      shaped.push(formatSource(s, await listDataSourceRequests(s.id)));
    }
    res.sources = shaped;
    return res;
  } catch (err) {
    return { ok: false, errors: [`failed to list data sources: ${(err as Error).message}`] };
  }
}

async function handleCreateDataSource(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreateDataSource(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const kek = await kekFromEnv();
    if (valid.value.secret && !kek) {
      return { ok: false, errors: ["cannot store a secret: the site has no CMS_AUTH_SECRET configured"] };
    }
    const source = await createDataSource(valid.value.source, valid.value.secret, kek);
    const requests: SafeDataSourceRequest[] = [];
    for (const r of valid.value.requests) {
      const created = await createDataSourceRequest(source.id, r);
      if (created) requests.push(created);
    }
    // Nest under `source:` — a spread top-level `name` would collide with the
    // dispatcher's tool name (and now be overwritten, losing the source name).
    return { ok: true, action: "created", source: formatSource(source, requests) };
  } catch (err) {
    return { ok: false, errors: [`failed to create data source: ${(err as Error).message}`] };
  }
}

async function handleTestDataSource(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateTestDataSource(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const resolved = await resolveSourceAndRequest(valid.value.source, valid.value.request);
    if (!resolved.ok) return { ok: false, errors: [resolved.error] };
    const { source, request } = resolved;
    const secret = source.hasSecret ? await decryptSourceSecret(source.id, await kekFromEnv()) : null;
    const result = await fetchSource(
      {
        id: source.id,
        baseUrl: source.baseUrl,
        authType: source.authType as AuthType,
        authParam: source.authParam,
        secret,
      },
      {
        id: request.id,
        method: request.method as HttpMethod,
        path: request.path,
        query: request.query,
        bodyTemplate: request.bodyTemplate,
        cacheEnabled: false, // live test — never read/write the render cache
        cacheTtlSec: request.cacheTtlSec,
        retryable: request.retryable,
      },
      valid.value.params,
      { cache: null },
    );
    if (!result.ok) {
      return {
        ok: false,
        errors: [
          `upstream request failed (status ${result.status ?? "none"}): ${result.error}. ` +
            `Check the request's {placeholder} params and the source's auth config.`,
        ],
      };
    }
    // `paths` covers the FULL response; `data` is size-capped for the context.
    return { ok: true, status: result.status, paths: samplePaths(result.data), data: sampleForModel(result.data) };
  } catch (err) {
    return { ok: false, errors: [`failed to test data source: ${(err as Error).message}`] };
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
    const loaded = await getDraftBlocks(page);
    if (!loaded) return { ok: false, errors: [`no page with id "${page}"`] };
    const target = findBlock(loaded.blocks, block);
    if (!target) return { ok: false, errors: [`no block with id "${block}" on this page`] };

    // Clear → drop the "item" binding (revert to static props).
    if (valid.value.clear) {
      const next = setBlockField(loaded.blocks, block, { bindings: undefined });
      const res = await setDraftBlocks(page, next, loaded.meta);
      if (!res.ok) return { ok: false, errors: res.errors };
      return { ok: true, action: "cleared", page, block };
    }

    // external-data-sources Slice 6: `source`+`request` → an api-kind binding
    // (map values are response dot-paths; only declared props are validatable).
    let binding: BindingRef;
    let boundTo: string;
    if (valid.value.source) {
      const resolved = await resolveSourceAndRequest(valid.value.source, valid.value.request!);
      if (!resolved.ok) return { ok: false, errors: [resolved.error] };
      binding = {
        source: {
          kind: "api",
          sourceId: resolved.source.id,
          requestId: resolved.request.id,
          ...(valid.value.params ? { params: valid.value.params } : {}),
        },
        map: valid.value.map!,
      };
      boundTo = resolved.source.name;
      const declared = await declaredProps(target.component);
      const check = validateBinding(binding, null, declared);
      if (!check.ok) return { ok: false, errors: check.errors };
    } else {
      binding = {
        source: { collection: valid.value.collection!, filter: valid.value.filter, sort: valid.value.sort },
        map: valid.value.map!,
      };
      boundTo = valid.value.collection!;
      const fields = await collectionFields(valid.value.collection!);
      if (fields === null) return { ok: false, errors: [await unknownCollectionMessage(valid.value.collection!)] };
      const declared = await declaredProps(target.component);
      const check = validateBinding(binding, fields, declared);
      if (!check.ok) return { ok: false, errors: check.errors };
    }

    const next = setBlockField(loaded.blocks, block, { bindings: { item: binding } });
    const res = await setDraftBlocks(page, next, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return {
      ok: true,
      action: "bound",
      page,
      block,
      ...(valid.value.source ? { source: boundTo } : { collection: boundTo }),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to bind component: ${(err as Error).message}`] };
  }
}

async function handleCreateList(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreateList(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { page, section, collection, template, filter, search, sort, limit, map } = valid.value;
  try {
    const loaded = await getDraftBlocks(page);
    if (!loaded) return { ok: false, errors: [`no page with id "${page}"`] };
    const sectionBlock = findBlock(loaded.blocks, section);
    if (!sectionBlock) return { ok: false, errors: [`no block with id "${section}" on this page`] };
    if (!isSection(sectionBlock)) return { ok: false, errors: [`block "${section}" is not a Section (insert a Section first)`] };

    // external-data-sources Slice 6: api rows (`source`+`request`) OR collection rows.
    let listSource: ListSource;
    let rowsFrom: string;
    const declared = await declaredProps(template);
    if (valid.value.source) {
      const resolved = await resolveSourceAndRequest(valid.value.source, valid.value.request!);
      if (!resolved.ok) return { ok: false, errors: [resolved.error] };
      listSource = {
        kind: "api",
        sourceId: resolved.source.id,
        requestId: resolved.request.id,
        ...(valid.value.params ? { params: valid.value.params } : {}),
        ...(valid.value.itemsPath ? { itemsPath: valid.value.itemsPath } : {}),
        ...(limit !== undefined ? { limit } : {}),
      };
      rowsFrom = resolved.source.name;
      const check = validateListBinding(listSource, map, null, declared);
      if (!check.ok) return { ok: false, errors: check.errors };
    } else {
      listSource = { collection: collection!, filter, search, sort, limit };
      rowsFrom = collection!;
      const fields = await collectionFields(collection!);
      if (fields === null) return { ok: false, errors: [await unknownCollectionMessage(collection!)] };
      const check = validateListBinding(listSource, map, fields, declared);
      if (!check.ok) return { ok: false, errors: check.errors };
    }

    // Insert the built-in List, then stamp its query/map + a template child.
    let next = addListToSection(loaded.blocks, section);
    const listId = newListId(loaded.blocks, next);
    next = setBlockField(next, listId, { listSource, listMap: map });
    const tpl: Block = { id: `${listId}-tpl`, component: template, listRole: "template" };
    next = setBlockChildren(next, listId, [tpl]);

    // Renderable check (mirror the page-blocks editor / setPageBlocks contract).
    // Grandfather the page's existing top-level blocks — this mutation only edits
    // inside a section, so it never introduces a new top-level stray.
    const shape = validateBlocks(next, {
      grandfatheredTopLevelIds: topLevelBlockIds(loaded.blocks),
    });
    if (!shape.ok) return { ok: false, errors: shape.errors };

    const res = await setDraftBlocks(page, shape.blocks, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return {
      ok: true,
      action: "created",
      page,
      list: listId,
      template,
      ...(valid.value.source ? { source: rowsFrom } : { collection: rowsFrom }),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to create list: ${(err as Error).message}`] };
  }
}

async function handleBindList(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateBindList(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { page, block } = valid.value;
  try {
    const loaded = await getDraftBlocks(page);
    if (!loaded) return { ok: false, errors: [`no page with id "${page}"`] };
    const listBlock = findBlock(loaded.blocks, block);
    if (!listBlock) return { ok: false, errors: [`no block with id "${block}" on this page`] };
    if (!isList(listBlock)) return { ok: false, errors: [`block "${block}" is not a List`] };

    // Merge the patch onto the existing config so partial updates work. The row
    // SOURCE kind is resolved first (external-data-sources Slice 6): an explicit
    // `source`/`collection` switches kinds (dropping the other kind's query
    // fields); otherwise the stored kind is kept and patched. Presentation +
    // combobox config always survive — only explicitly-passed fields change.
    const v = valid.value;
    const prevSource: ListSource = listBlock.listSource ?? { collection: "" };
    const wantsApi = v.source !== undefined || (v.collection === undefined && prevSource.kind === "api");

    let base: ListSource;
    let rowsFrom: string;
    if (wantsApi) {
      let sourceId = prevSource.kind === "api" ? prevSource.sourceId : undefined;
      let requestId = prevSource.kind === "api" ? prevSource.requestId : undefined;
      rowsFrom = sourceId ?? "";
      if (v.source) {
        const resolved = await resolveSourceAndRequest(v.source, v.request!);
        if (!resolved.ok) return { ok: false, errors: [resolved.error] };
        sourceId = resolved.source.id;
        requestId = resolved.request.id;
        rowsFrom = resolved.source.name;
      }
      if (!sourceId || !requestId) {
        return { ok: false, errors: ["this list has no row source yet — pass `collection`, or `source`+`request` for API rows"] };
      }
      const { collection: _c, filter: _f, sort: _s, ...keep } = prevSource;
      base = { ...keep, kind: "api", sourceId, requestId };
      if (v.params !== undefined) base.params = v.params;
      if (v.itemsPath !== undefined) base.itemsPath = v.itemsPath;
    } else {
      const collection = v.collection ?? prevSource.collection;
      if (!collection) return { ok: false, errors: ["this list has no collection yet — pass `collection`, or `source`+`request` for API rows"] };
      // Collection lists persist NO kind field (legacy stored lists stay byte-identical).
      const { kind: _k, sourceId: _si, requestId: _ri, params: _p, itemsPath: _ip, ...keep } = prevSource;
      base = { ...keep, collection };
      if (v.filter !== undefined) base.filter = v.filter;
      if (v.search !== undefined) base.search = v.search;
      if (v.sort !== undefined) base.sort = v.sort;
      rowsFrom = collection;
    }

    const patch: Partial<ListSource> = {};
    if (v.limit !== undefined) patch.limit = v.limit;
    if (v.presentation !== undefined) patch.presentation = v.presentation;
    if (v.direction !== undefined) patch.direction = v.direction;
    if (v.columns !== undefined) patch.columns = v.columns;
    if (v.columnsTablet !== undefined) patch.columnsTablet = v.columnsTablet;
    if (v.columnsMobile !== undefined) patch.columnsMobile = v.columnsMobile;
    if (v.gap !== undefined) patch.gap = v.gap;
    if (v.maxSize !== undefined) patch.maxSize = v.maxSize;
    if (v.autoscroll !== undefined) patch.autoscroll = v.autoscroll;
    if (v.autoscrollSpeed !== undefined) patch.autoscrollSpeed = v.autoscrollSpeed;
    if (v.select !== undefined) patch.select = v.select;
    if (v.min !== undefined) patch.min = v.min;
    if (v.max !== undefined) patch.max = v.max;
    if (v.searchable !== undefined) patch.searchable = v.searchable;
    if (v.valueField !== undefined) patch.valueField = v.valueField;
    if (v.labelField !== undefined) patch.labelField = v.labelField;
    if (v.labelExpr !== undefined) patch.labelExpr = v.labelExpr;
    if (v.name !== undefined) patch.name = v.name;
    if (v.placeholder !== undefined) patch.placeholder = v.placeholder;
    if (v.searchPlaceholder !== undefined) patch.searchPlaceholder = v.searchPlaceholder;
    const listSource = { ...base, ...patch };
    const listMap = valid.value.map ?? listBlock.listMap ?? {};

    // Template: the existing template child's component, unless replacing it.
    const prevTpl = (listBlock.children ?? []).find((c) => c.listRole !== "empty");
    const template = valid.value.template ?? prevTpl?.component;
    if (!template) return { ok: false, errors: ["this list has no template yet — pass `template`"] };

    const declared = await declaredProps(template);
    let check: { ok: true } | { ok: false; errors: string[] };
    if (listSource.kind === "api") {
      check = validateListBinding(listSource, listMap, null, declared);
    } else {
      const fields = await collectionFields(listSource.collection!);
      if (fields === null) return { ok: false, errors: [await unknownCollectionMessage(listSource.collection!)] };
      check = validateListBinding(listSource, listMap, fields, declared);
    }
    if (!check.ok) return { ok: false, errors: check.errors };

    let next = setBlockField(loaded.blocks, block, { listSource, listMap });
    // Replace the template component if requested, preserving any empty-state child.
    if (valid.value.template) {
      const emptyChild = (listBlock.children ?? []).find((c) => c.listRole === "empty");
      const tpl: Block = { id: `${block}-tpl`, component: template, listRole: "template" };
      next = setBlockChildren(next, block, emptyChild ? [tpl, emptyChild] : [tpl]);
    }

    const shape = validateBlocks(next, {
      grandfatheredTopLevelIds: topLevelBlockIds(loaded.blocks),
    });
    if (!shape.ok) return { ok: false, errors: shape.errors };
    const res = await setDraftBlocks(page, shape.blocks, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return {
      ok: true,
      action: "bound",
      page,
      list: block,
      template,
      ...(listSource.kind === "api" ? { source: rowsFrom } : { collection: rowsFrom }),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to bind list: ${(err as Error).message}`] };
  }
}

// ── external-data-sources Form slice (d): built-in Form block tools ───────────
// create_form inserts a Form block into a Section column (mirroring create_list)
// and sets its `formTarget`; bind_form PATCHes an existing Form's target/
// messages. Target validation is the whole point: an api target must name a
// REAL source + saved request (resolved by id OR name, ids persisted); a
// collection target must EXIST and have publicSubmissions ENABLED — the same
// gates the submit endpoint enforces at POST time, surfaced at AUTHORING time
// with self-correcting errors. Both tools return the field NAMES the form's
// child inputs must use (mapping is by-name — see submit-core.ts).

type ResolvedFormTarget = {
  target: { api?: { sourceId: string; requestId: string }; collection?: string };
  /** The input names the form's child component must render. */
  fields: string[];
  /** Human label for the result payload (source name / table name). */
  boundTo: string;
};

/** Resolve + validate a form target (api source/request OR collection). */
async function resolveFormTarget(
  sourceRef: string | undefined,
  requestRef: string | undefined,
  collectionRef: string | undefined,
): Promise<{ ok: true; value: ResolvedFormTarget } | { ok: false; error: string }> {
  if (sourceRef) {
    const resolved = await resolveSourceAndRequest(sourceRef, requestRef!);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    return {
      ok: true,
      value: {
        target: { api: { sourceId: resolved.source.id, requestId: resolved.request.id } },
        fields: requestPlaceholders({
          path: resolved.request.path,
          query: resolved.request.query,
          bodyTemplate: resolved.request.bodyTemplate,
        }),
        boundTo: resolved.source.name,
      },
    };
  }
  const view = await getCollection(collectionRef!);
  if (!view) return { ok: false, error: await unknownCollectionMessage(collectionRef!) };
  if (!view.publicSubmissions) {
    return {
      ok: false,
      error:
        `collection "${view.tableName}" exists but has NOT opted in to public form submissions ` +
        `(publicSubmissions is off), so a visitor form cannot write to it. The operator must enable it ` +
        `first — PATCH /api/collections/${view.tableName} with {"_op":"set_public_submissions","enabled":true} ` +
        `(a deliberate operator-only switch; there is no AI tool to flip it). Then retry this tool.`,
    };
  }
  return {
    ok: true,
    value: {
      target: { collection: view.tableName },
      fields: view.fields.map((f) => f.name),
      boundTo: view.tableName,
    },
  };
}

/** The `fields` guidance both tools return (by-name mapping, see form-tools.ts). */
function formFieldsNote(target: { api?: unknown }, fields: string[], child?: string): string {
  const what = target.api
    ? "the saved request's {placeholder} names"
    : "the collection's declared field names";
  const needs =
    fields.length > 0
      ? `<input name=…> fields matching ${what} (${fields.join(", ")}) and a type="submit" button`
      : `only a type="submit" button (this target declares no fields)`;
  return child
    ? `placed "${child}" inside the form — verify it renders ${needs}`
    : `place a component inside the form that renders ${needs}`;
}

async function handleCreateForm(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreateForm(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const v = valid.value;
  try {
    const loaded = await getDraftBlocks(v.page);
    if (!loaded) return { ok: false, errors: [`no page with id "${v.page}"`] };
    const sectionBlock = findBlock(loaded.blocks, v.section);
    if (!sectionBlock) return { ok: false, errors: [`no block with id "${v.section}" on this page`] };
    if (!isSection(sectionBlock)) return { ok: false, errors: [`block "${v.section}" is not a Section (insert a Section first)`] };

    // Optional `child`: an EXISTING component placed inside the form in the same
    // call (one call → a submittable form, no full-replace update_page_blocks).
    if (v.child && !(await getComponentByName(v.child))) {
      return { ok: false, errors: [await unknownComponentMessage([v.child])] };
    }

    const resolved = await resolveFormTarget(v.source, v.request, v.collection);
    if (!resolved.ok) return { ok: false, errors: [resolved.error] };

    const formTarget = mergeFormTarget(undefined, {
      ...resolved.value.target,
      successMessage: v.successMessage,
      errorMessage: v.errorMessage,
      redirect: v.redirect,
    });

    let next = addFormToSection(loaded.blocks, v.section);
    const formId = newBlockId(loaded.blocks, next, FORM_COMPONENT);
    if (!formId) return { ok: false, errors: [`failed to insert the Form into section "${v.section}"`] };
    next = setBlockField(next, formId, { formTarget });
    if (v.child) next = setBlockChildren(next, formId, [{ id: `${formId}-child`, component: v.child }]);

    const shape = validateBlocks(next, {
      grandfatheredTopLevelIds: topLevelBlockIds(loaded.blocks),
    });
    if (!shape.ok) return { ok: false, errors: shape.errors };
    const res = await setDraftBlocks(v.page, shape.blocks, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return {
      ok: true,
      action: "created",
      page: v.page,
      form: formId,
      ...(resolved.value.target.api ? { source: resolved.value.boundTo } : { collection: resolved.value.boundTo }),
      ...(v.child ? { child: v.child } : {}),
      fields: resolved.value.fields,
      note: formFieldsNote(resolved.value.target, resolved.value.fields, v.child),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to create form: ${(err as Error).message}`] };
  }
}

async function handleBindForm(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateBindForm(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const v = valid.value;
  try {
    const loaded = await getDraftBlocks(v.page);
    if (!loaded) return { ok: false, errors: [`no page with id "${v.page}"`] };
    const formBlock = findBlock(loaded.blocks, v.block);
    if (!formBlock) return { ok: false, errors: [`no block with id "${v.block}" on this page`] };
    if (!isForm(formBlock)) return { ok: false, errors: [`block "${v.block}" is not a Form (create one with create_form)`] };

    if (v.clear) {
      const next = setBlockField(loaded.blocks, v.block, { formTarget: undefined });
      const res = await setDraftBlocks(v.page, next, loaded.meta);
      if (!res.ok) return { ok: false, errors: res.errors };
      return { ok: true, action: "cleared", page: v.page, form: v.block };
    }

    // A target patch is validated fresh; a messages-only patch keeps (and
    // re-validates nothing about) the stored target — but the stored target must
    // EXIST for the messages to ever show, so surface that as a hint, not a block.
    let resolved: ResolvedFormTarget | null = null;
    if (v.source || v.collection) {
      const r = await resolveFormTarget(v.source, v.request, v.collection);
      if (!r.ok) return { ok: false, errors: [r.error] };
      resolved = r.value;
    }

    const prev = formBlock.formTarget as FormTarget | undefined;
    const formTarget = mergeFormTarget(prev, {
      ...(resolved ? resolved.target : {}),
      successMessage: v.successMessage,
      errorMessage: v.errorMessage,
      redirect: v.redirect,
    });
    if (!formTarget.kind) {
      return {
        ok: false,
        errors: [
          "this form has no target yet — pass `source`+`request` (API saved request) or `collection` (opted-in collection) along with your change",
        ],
      };
    }

    const next = setBlockField(loaded.blocks, v.block, { formTarget });
    const res = await setDraftBlocks(v.page, next, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return {
      ok: true,
      action: "bound",
      page: v.page,
      form: v.block,
      ...(resolved
        ? {
            ...(resolved.target.api ? { source: resolved.boundTo } : { collection: resolved.boundTo }),
            fields: resolved.fields,
            note: formFieldsNote(resolved.target, resolved.fields),
          }
        : {}),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to bind form: ${(err as Error).message}`] };
  }
}

// ── System-prompt version CRUD ────────────────────────────────────────────────
// Manage saved system-prompt versions (the named full prompts an operator keeps
// to compare). Storing/editing a version NEVER changes the site's active default
// — selecting one to actually use is the chat route's per-request override path.

async function handleListPrompts(args: unknown): Promise<Record<string, unknown>> {
  try {
    return pagedResult("prompts", await listPromptVersions(), coercePageArgs(args));
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
    if (target === "component.html" || target === "component.script" || target === "component.css") {
      // Edit the DRAFT base (preferDraft) so a tweak stacks on the pending
      // draft instead of reverting to live; upsertComponent re-drafts it.
      const row = await getComponentByName(selector, true);
      if (!row) return { ok: false, errors: [`no component named "${selector}"`] };
      // The edit base for html is the SAME serialization get_component shows the
      // model (treeToHtml of the stored tree), so its oldString quotes match.
      let tree: TreeNode;
      try {
        tree = JSON.parse(row.tree as string) as TreeNode;
      } catch {
        return { ok: false, errors: ["stored component markup is not valid; use update_component"] };
      }
      const storedHtml = treeToHtml(tree);
      const field = target === "component.html" ? "html" : target === "component.script" ? "script" : "css";
      const current =
        field === "html" ? storedHtml
        : field === "script" ? ((row.script as string) ?? "")
        : ((row.css as string) ?? "");
      const edit = applyEdit(current, oldString, newString, replaceAll);
      if (!edit.ok) return { ok: false, errors: [edit.error] };

      // Re-pass the FULL artifact through the same validate gate as create/update
      // — an html patch re-runs the strict lint (tag balance, slot syntax). For
      // html edits the STORED propsSchema rides along so the slot↔schema
      // cross-check runs too (only for html: a script/css tweak must not be
      // blocked by a pre-existing slot issue in untouched markup).
      const artifact = {
        name: row.name,
        html: field === "html" ? edit.content : storedHtml,
        script: field === "script" ? edit.content : ((row.script as string) ?? ""),
        css: field === "css" ? edit.content : ((row.css as string) ?? ""),
        ...(field === "html" && row.propsSchema ? { propsSchema: row.propsSchema as string } : {}),
      };
      const checked = validateComponentArtifact(artifact);
      if (!checked.ok) return { ok: false, errors: checked.errors };
      // Script↔markup lint: BLOCKS when the script itself is being edited (the
      // model is authoring it now); rides as a warning on html/css edits — a
      // pre-existing script nit must not block an unrelated text tweak, but an
      // html edit that removes a hook the script queries should be surfaced.
      const scriptFindings = lintComponentScript(checked.artifact.tree, checked.artifact.script);
      if (field === "script" && scriptFindings.length > 0) {
        return { ok: false, errors: scriptFindings };
      }
      const res = await upsertComponent(checked.artifact);
      const warnings = [
        ...(field === "script" ? [] : scriptFindings),
        ...(await reconcileComponentClasses(
          checked.artifact.tree,
          checked.artifact.css,
          checked.artifact.script,
        )),
      ];
      return {
        ok: true,
        action: "edited",
        target,
        component: res.name,
        replacements: edit.replacements,
        matcher: edit.matcher,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
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

/** The id of the built-in block just appended by add*ToSection (the new block in `after`). */
function newBlockId(before: Block[], after: Block[], component: string): string {
  const had = new Set<string>();
  const collect = (bs: Block[]) => bs.forEach((b) => { had.add(b.id); if (b.children) collect(b.children); });
  collect(before);
  let found = "";
  const scan = (bs: Block[]) => bs.forEach((b) => {
    if (!had.has(b.id) && b.component === component) found = b.id;
    if (b.children) scan(b.children);
  });
  scan(after);
  return found;
}

/** The id of the List just appended by addListToSection. */
function newListId(before: Block[], after: Block[]): string {
  return newBlockId(before, after, LIST_COMPONENT);
}

// ── The handler map + dispatcher ──────────────────────────────────────────────
// Keyed by tool name (== function.name == TOOL_BY_NAME key). Read tools ignore
// args; we wrap the no-arg handlers so every entry is `(args) => Promise<…>`.
const HANDLERS: Record<ToolName, ToolHandler> = {
  create_component: handleCreateComponent,
  create_page: handleCreatePage,
  translate: handleTranslate,
  list_assets: handleListAssets,
  list_components: handleListComponents,
  get_component: handleGetComponent,
  list_pages: handleListPages,
  get_page: handleGetPage,
  list_locales: () => handleListLocales(),
  search_icons: (args) => handleSearchIcons(args),
  get_brand_identity: () => handleGetBrandIdentity(),
  get_theme: () => handleGetTheme(),
  list_builtin_types: () => handleListBuiltinTypes(),
  update_component: handleUpdateComponent,
  update_page_blocks: handleUpdatePageBlocks,
  set_block_props: handleSetBlockProps,
  update_brand_identity: handleUpdateBrandIdentity,
  update_theme: handleUpdateTheme,
  create_collection: handleCreateCollection,
  add_collection_item: handleAddCollectionItem,
  update_collection_item: handleUpdateCollectionItem,
  archive_collection_item: handleArchiveCollectionItem,
  query_collection: handleQueryCollection,
  add_collection_field: handleAddCollectionField,
  drop_collection_field: handleDropCollectionField,
  rename_collection_field: handleRenameCollectionField,
  bind_component: handleBindComponent,
  create_list: handleCreateList,
  bind_list: handleBindList,
  list_prompts: handleListPrompts,
  create_prompt: handleCreatePrompt,
  update_prompt: handleUpdatePrompt,
  delete_prompt: handleDeletePrompt,
  edit_text: handleEditText,
  get_authoring_guide: handleGetAuthoringGuide,
  generate_image: handleGenerateImage,
  list_data_sources: handleListDataSources,
  create_data_source: handleCreateDataSource,
  test_data_source: handleTestDataSource,
  create_form: handleCreateForm,
  bind_form: handleBindForm,
  // Static playbook — no store/CF work, so the handler is a constant payload.
  get_data_sources_guide: async () => ({ ok: true, guide: DATA_SOURCES_GUIDE }),
};

/**
 * Run ONE tool call → structured `{name, ok, …}` result. Used by the chat route's
 * tool round and (Slice 3) the MCP `tools/call`. Unknown tool or a thrown handler
 * → `{ok:false, errors}`; never throws.
 */
export const runTool: (name: string, args: unknown) => Promise<DispatchResult> =
  makeDispatcher(HANDLERS as Record<string, ToolHandler>);
