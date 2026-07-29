/**
 * Shared CMS AI tool dispatch (cms-mcp Slice 1) — the ONE place tool calls run.
 *
 * Both the browser chat route (`app/api/chat/route.ts`, cookie-authed SSE) and
 * the remote MCP server (per-Site Worker, API-key authed) call this so there is
 * a single validated tool path — no forked logic, no drifting safety gates (see
 * cms-mcp CAVEATS/GOAL). Each handler does the SAME validate→store work the chat
 * route did inline; the result is a plain `{ok, …}` payload (no SSE coupling).
 * The dispatcher (`runTool`) tags it with the tool `name`.
 *
 * The tool registry (`TOOL_BY_NAME`) is keyed by `function.name`, matching the
 * shared `KNOWN_TOOL_NAMES` in `tool-scopes.ts`. `toolSchemasForContext` /
 * `allToolSchemas` enumerate it, so a tool added to the registry is dispatchable
 * AND exposed everywhere (chat scopes + MCP) for free.
 *
 * THIS file is only the registry + the HANDLERS map + `runTool` — the handler
 * implementations live in the per-domain `tool-dispatch-*.ts` modules (read,
 * write, collections, data-sources, chat-agents, bindings-forms, prompts,
 * edit-text, media), with cross-domain helpers in `tool-dispatch-shared.ts`.
 * CF-coupled (imports `@/db/*` transitively) → NOT node-loadable. The pure
 * dispatch/selection logic lives in `tool-dispatch-core.ts` and is unit-tested
 * there.
 */
import { CREATE_COMPONENT_TOOL } from "./component-tool";
import { CREATE_PAGE_TOOL } from "./page-tool";
import { AUDIT_META_TOOL, AUDIT_ALT_TOOL, SET_PAGE_META_TOOL } from "./meta-tools";
import { CREATE_TRANSLATION_TOOL } from "./translate-tool";
import { LIST_ASSETS_TOOL } from "./list-assets-tool";
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
} from "./read-tools";
import {
  UPDATE_COMPONENT_TOOL,
  UPDATE_PAGE_BLOCKS_TOOL,
  SET_BLOCK_PROPS_TOOL,
  UPDATE_BRAND_IDENTITY_TOOL,
  UPDATE_THEME_TOOL,
  LIST_BUILTIN_TYPES_TOOL,
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
  UPDATE_COLLECTION_TOOL,
  UPDATE_COLLECTION_FIELD_TOOL,
  DELETE_COLLECTION_TOOL,
  RESTORE_COLLECTION_ITEM_TOOL,
  DELETE_COLLECTION_ITEM_TOOL,
} from "./collection-tools";
import { BIND_COMPONENT_TOOL, CREATE_LIST_TOOL, BIND_LIST_TOOL } from "./binding-tools";
import {
  LIST_DATA_SOURCES_TOOL,
  CREATE_DATA_SOURCE_TOOL,
  UPDATE_DATA_SOURCE_TOOL,
  SET_DATA_SOURCE_REQUEST_TOOL,
  DELETE_DATA_SOURCE_REQUEST_TOOL,
  DELETE_DATA_SOURCE_TOOL,
  TEST_DATA_SOURCE_TOOL,
} from "./data-source-tools";
import { CREATE_FORM_TOOL, BIND_FORM_TOOL } from "./form-tools";
import {
  GET_DATA_SOURCES_GUIDE_TOOL,
  DATA_SOURCES_GUIDE,
} from "./data-sources-guide";
import {
  LIST_CHAT_AGENTS_TOOL,
  CREATE_CHAT_AGENT_TOOL,
  UPDATE_CHAT_AGENT_TOOL,
  DELETE_CHAT_AGENT_TOOL,
  GET_CHAT_AGENT_TOOL,
  UPDATE_CHAT_AGENT_SETTINGS_TOOL,
  SET_CHAT_AGENT_LIMITS_TOOL,
  SET_CHAT_AGENT_DATA_SOURCE_TOOL,
  REMOVE_CHAT_AGENT_DATA_SOURCE_TOOL,
  SET_CHAT_AGENT_COLLECTION_TOOL,
  REMOVE_CHAT_AGENT_COLLECTION_TOOL,
} from "./chat-agent-tool-schemas";
import { GET_CHAT_AGENTS_GUIDE_TOOL, CHAT_AGENTS_GUIDE } from "./chat-agents-guide";
import { GET_JSONLD_GUIDE_TOOL, JSONLD_GUIDE } from "./jsonld-guide";
import {
  LIST_PROMPTS_TOOL,
  CREATE_PROMPT_TOOL,
  UPDATE_PROMPT_TOOL,
  DELETE_PROMPT_TOOL,
} from "./prompt-tools";
import { EDIT_TEXT_TOOL } from "./edit-text-tool";
import { GENERATE_IMAGE_TOOL } from "./generate-image-tool";
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
  handleAuditMeta,
  handleAuditAlt,
  handleListAssets,
  handleListComponents,
  handleGetComponent,
  handleListPages,
  handleGetPage,
  handleListLocales,
  handleGetBrandIdentity,
  handleSearchIcons,
  handleGetTheme,
  handleListBuiltinTypes,
  handleGetAuthoringGuide,
} from "./tool-dispatch-read";
import {
  handleCreateComponent,
  handleUpdateComponent,
  handleCreatePage,
  handleTranslate,
  handleSetPageMeta,
  handleUpdatePageBlocks,
  handleSetBlockProps,
  handleUpdateBrandIdentity,
  handleUpdateTheme,
} from "./tool-dispatch-write";
import {
  handleCreateCollection,
  handleAddCollectionItem,
  handleUpdateCollectionItem,
  handleArchiveCollectionItem,
  handleQueryCollection,
  handleAddCollectionField,
  handleDropCollectionField,
  handleRenameCollectionField,
  handleUpdateCollection,
  handleUpdateCollectionField,
  handleDeleteCollection,
  handleRestoreCollectionItem,
  handleDeleteCollectionItem,
} from "./tool-dispatch-collections";
import {
  handleListDataSources,
  handleCreateDataSource,
  handleUpdateDataSource,
  handleSetDataSourceRequest,
  handleDeleteDataSourceRequest,
  handleDeleteDataSource,
  handleTestDataSource,
} from "./tool-dispatch-data-sources";
import {
  handleListChatAgents,
  handleCreateChatAgent,
  handleUpdateChatAgent,
  handleDeleteChatAgent,
  handleGetChatAgent,
  handleUpdateChatAgentSettings,
  handleSetChatAgentLimits,
  handleSetChatAgentDataSource,
  handleRemoveChatAgentDataSource,
  handleSetChatAgentCollection,
  handleRemoveChatAgentCollection,
} from "./tool-dispatch-chat-agents";
import {
  handleBindComponent,
  handleCreateList,
  handleBindList,
  handleCreateForm,
  handleBindForm,
} from "./tool-dispatch-bindings-forms";
import {
  handleListPrompts,
  handleCreatePrompt,
  handleUpdatePrompt,
  handleDeletePrompt,
} from "./tool-dispatch-prompts";
import { handleEditText } from "./tool-dispatch-edit-text";
import { handleGenerateImage } from "./tool-dispatch-media";

export type { DispatchResult } from "./tool-dispatch-core";

// ── Tool registry ─────────────────────────────────────────────────────────────
// Keyed by the tool's function.name; the keys MUST match KNOWN_TOOL_NAMES in
// tool-scopes.ts. New tools land here and are exposed everywhere automatically.
export const TOOL_BY_NAME: Record<ToolName, unknown> = {
  create_component: CREATE_COMPONENT_TOOL,
  create_page: CREATE_PAGE_TOOL,
  audit_meta: AUDIT_META_TOOL,
  audit_alt: AUDIT_ALT_TOOL,
  set_page_meta: SET_PAGE_META_TOOL,
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
  update_collection: UPDATE_COLLECTION_TOOL,
  update_collection_field: UPDATE_COLLECTION_FIELD_TOOL,
  delete_collection: DELETE_COLLECTION_TOOL,
  restore_collection_item: RESTORE_COLLECTION_ITEM_TOOL,
  delete_collection_item: DELETE_COLLECTION_ITEM_TOOL,
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
  update_data_source: UPDATE_DATA_SOURCE_TOOL,
  set_data_source_request: SET_DATA_SOURCE_REQUEST_TOOL,
  delete_data_source_request: DELETE_DATA_SOURCE_REQUEST_TOOL,
  delete_data_source: DELETE_DATA_SOURCE_TOOL,
  test_data_source: TEST_DATA_SOURCE_TOOL,
  create_form: CREATE_FORM_TOOL,
  bind_form: BIND_FORM_TOOL,
  get_data_sources_guide: GET_DATA_SOURCES_GUIDE_TOOL,
  get_jsonld_guide: GET_JSONLD_GUIDE_TOOL,
  list_chat_agents: LIST_CHAT_AGENTS_TOOL,
  create_chat_agent: CREATE_CHAT_AGENT_TOOL,
  update_chat_agent: UPDATE_CHAT_AGENT_TOOL,
  delete_chat_agent: DELETE_CHAT_AGENT_TOOL,
  get_chat_agents_guide: GET_CHAT_AGENTS_GUIDE_TOOL,
  get_chat_agent: GET_CHAT_AGENT_TOOL,
  update_chat_agent_settings: UPDATE_CHAT_AGENT_SETTINGS_TOOL,
  set_chat_agent_limits: SET_CHAT_AGENT_LIMITS_TOOL,
  set_chat_agent_data_source: SET_CHAT_AGENT_DATA_SOURCE_TOOL,
  remove_chat_agent_data_source: REMOVE_CHAT_AGENT_DATA_SOURCE_TOOL,
  set_chat_agent_collection: SET_CHAT_AGENT_COLLECTION_TOOL,
  remove_chat_agent_collection: REMOVE_CHAT_AGENT_COLLECTION_TOOL,
};

/** The tool SCHEMAS the assistant may use in this admin-page context (chat route). */
export function toolSchemasForContext(context: AdminPageContext): unknown[] {
  return selectToolSchemas(TOOL_BY_NAME, toolsForContext(context));
}

/** ALL tool schemas, ordered by the registry (the MCP server's full surface). */
export function allToolSchemas(): unknown[] {
  return Object.values(TOOL_BY_NAME);
}

// ── The handler map + dispatcher ──────────────────────────────────────────────
// Keyed by tool name (== function.name == TOOL_BY_NAME key). Read tools ignore
// args; we wrap the no-arg handlers so every entry is `(args) => Promise<…>`.
const HANDLERS: Record<ToolName, ToolHandler> = {
  create_component: handleCreateComponent,
  create_page: handleCreatePage,
  audit_meta: () => handleAuditMeta(),
  audit_alt: () => handleAuditAlt(),
  set_page_meta: handleSetPageMeta,
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
  update_collection: handleUpdateCollection,
  update_collection_field: handleUpdateCollectionField,
  delete_collection: handleDeleteCollection,
  restore_collection_item: handleRestoreCollectionItem,
  delete_collection_item: handleDeleteCollectionItem,
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
  update_data_source: handleUpdateDataSource,
  set_data_source_request: handleSetDataSourceRequest,
  delete_data_source_request: handleDeleteDataSourceRequest,
  delete_data_source: handleDeleteDataSource,
  test_data_source: handleTestDataSource,
  create_form: handleCreateForm,
  bind_form: handleBindForm,
  list_chat_agents: () => handleListChatAgents(),
  create_chat_agent: handleCreateChatAgent,
  update_chat_agent: handleUpdateChatAgent,
  delete_chat_agent: handleDeleteChatAgent,
  get_chat_agent: handleGetChatAgent,
  update_chat_agent_settings: handleUpdateChatAgentSettings,
  set_chat_agent_limits: handleSetChatAgentLimits,
  set_chat_agent_data_source: handleSetChatAgentDataSource,
  remove_chat_agent_data_source: handleRemoveChatAgentDataSource,
  set_chat_agent_collection: handleSetChatAgentCollection,
  remove_chat_agent_collection: handleRemoveChatAgentCollection,
  // Static playbook — no store/CF work, so the handler is a constant payload.
  get_data_sources_guide: async () => ({ ok: true, guide: DATA_SOURCES_GUIDE }),
  get_jsonld_guide: async () => ({ ok: true, guide: JSONLD_GUIDE }),
  get_chat_agents_guide: async () => ({ ok: true, guide: CHAT_AGENTS_GUIDE }),
};

/**
 * Run ONE tool call → structured `{name, ok, …}` result. Used by the chat route's
 * tool round and the MCP `tools/call`. Unknown tool or a thrown handler →
 * `{ok:false, errors}`; never throws.
 */
export const runTool: (name: string, args: unknown) => Promise<DispatchResult> =
  makeDispatcher(HANDLERS as Record<string, ToolHandler>);
