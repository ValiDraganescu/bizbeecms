/**
 * Page-awareness for the CMS AI assistant (Milestone 2, ai-assistant goal, Slice 2).
 * Ported from aicms `lib/chat/tool_scopes.ts`, trimmed to bizbeecms reality:
 *   - bizbee admin paths have NO `/<locale>/` prefix (locale is cookie-driven),
 *     so `detectAdminContext` just reads the segment after `admin`.
 *   - bizbee has NO gallery/e-commerce entities (artwork/product/discount/order),
 *     so those contexts/tools are dropped. Only the FOUR tools that exist today
 *     are scoped: create_component, create_page, translate, list_assets.
 *
 * This module is PURE (no React/D1/CF/tool-object imports) so it's unit-testable
 * with the project's dep-free `node --test` convention (see CAVEATS). It speaks
 * in tool NAMES (strings); the chat route maps those to the real tool objects so
 * the pure boundary holds. Add new contexts/tools here as their backends land
 * (Slice 3 ports update_page_blocks, list_components, get/update settings, …).
 */

// ── Admin page contexts (only ones with real bizbee routes + scoped tools) ────

export type AdminPageContext =
  | "page-builder"
  | "components"
  | "pages"
  | "settings"
  | "media"
  | "collections"
  | "general";

const KNOWN_CONTEXTS: AdminPageContext[] = [
  "page-builder",
  "components",
  "pages",
  "settings",
  "media",
  "collections",
];

// The tools that EXIST in bizbee today (must match each tool's function.name).
// Slice 3 adds more; extend TOOLS_BY_CONTEXT when their backends land.
export const KNOWN_TOOL_NAMES = [
  "create_component",
  "create_page",
  "translate",
  "list_assets",
  // Slice 3 read-only discovery tools.
  "list_components",
  "get_component",
  "list_pages",
  "get_page",
  "list_locales",
  "get_brand_identity",
  "get_theme",
  "list_builtin_types",
  // Slice 3 part 2 write tools.
  "update_component",
  "update_page_blocks",
  "update_brand_identity",
  "update_theme",
  // Slice 6 (content-collections): structured collection data tools.
  "create_collection",
  "add_collection_item",
  "update_collection_item",
  "archive_collection_item",
  "query_collection",
  // Slice D (content-collections P2-bind): component↔collection binding tools.
  "bind_component",
  "create_list",
  "bind_list",
] as const;
export type ToolName = (typeof KNOWN_TOOL_NAMES)[number];

// ── Context detection from a path or URL ──────────────────────────────────────

/**
 * Resolve the admin page context from a pathname or full URL. bizbee admin
 * routes are `/admin/<page>` (no locale prefix). Anything not under `admin`, or
 * an unknown page, falls back to "general" (all tools) so the assistant still
 * works off the known admin pages.
 */
export function detectAdminContext(pathOrUrl: string): AdminPageContext {
  if (typeof pathOrUrl !== "string" || pathOrUrl === "") return "general";
  let pathname = pathOrUrl;
  // Accept a full URL too — strip scheme/host if present.
  try {
    if (/^https?:\/\//i.test(pathOrUrl)) pathname = new URL(pathOrUrl).pathname;
  } catch {
    return "general";
  }
  // Drop any query/hash on a bare path (usePathname omits these, but be robust).
  pathname = pathname.split(/[?#]/, 1)[0];
  const segments = pathname.split("/").filter(Boolean);
  const adminIndex = segments.indexOf("admin");
  if (adminIndex === -1) return "general";
  const page = segments[adminIndex + 1];
  return (KNOWN_CONTEXTS as string[]).includes(page)
    ? (page as AdminPageContext)
    : "general";
}

/** True for any context value the caller might send (guards untrusted client input). */
export function isAdminContext(v: unknown): v is AdminPageContext {
  return (
    v === "general" || (KNOWN_CONTEXTS as string[]).includes(v as string)
  );
}

/**
 * The ONE untrusted→context resolution both the chat POST route (body
 * `{context,pathname}`) and the debug GET route (`?context=&pathname=`) use:
 * a valid explicit `context` wins; else detect from `pathname`; else "general"
 * (full toolset). Never throws — every input is untrusted.
 */
export function resolveRequestContext(
  context: unknown,
  pathname: unknown,
): AdminPageContext {
  if (isAdminContext(context)) return context;
  if (typeof pathname === "string") return detectAdminContext(pathname);
  return "general";
}

// ── Tool scoping (by tool name) ───────────────────────────────────────────────

/**
 * Tool names available per context. Each maps to the EXISTING bizbee tools only
 * — a name with no backend would be a dead tool (see CAVEATS). "general" gets
 * everything (the assistant on a non-builder page can still do anything).
 */
const TOOLS_BY_CONTEXT: Record<AdminPageContext, readonly ToolName[]> = {
  // Building pages: discover, author + UPDATE components/pages, see brand/theme + media.
  "page-builder": [
    "create_component",
    "create_page",
    "update_component",
    "update_page_blocks",
    "list_assets",
    "list_components",
    "get_component",
    "list_pages",
    "get_page",
    "list_builtin_types",
    "get_brand_identity",
    "get_theme",
    // Bind blocks/Lists to collection data (discover collections via query_collection).
    "query_collection",
    "bind_component",
    "create_list",
    "bind_list",
  ],
  // Component playground: discover + author/UPDATE components, see brand/theme + media.
  components: [
    "create_component",
    "update_component",
    "list_assets",
    "list_components",
    "get_component",
    "get_brand_identity",
    "get_theme",
  ],
  // Pages list: discover pages, compose/UPDATE + translate them, reference media.
  pages: [
    "create_page",
    "update_page_blocks",
    "translate",
    "list_assets",
    "list_pages",
    "get_page",
    "list_builtin_types",
    "list_locales",
    // Bind page blocks/Lists to collection data.
    "query_collection",
    "bind_component",
    "create_list",
    "bind_list",
  ],
  // Settings: read + UPDATE brand/theme, read locales, translate into site locales.
  settings: [
    "translate",
    "list_locales",
    "get_brand_identity",
    "get_theme",
    "update_brand_identity",
    "update_theme",
  ],
  // Media library: list assets (upload/serve UI is separate).
  media: ["list_assets"],
  // Collections: define collections + CRUD/query their items (structured only).
  collections: [
    "create_collection",
    "add_collection_item",
    "update_collection_item",
    "archive_collection_item",
    "query_collection",
  ],
  // Anywhere else: full toolset.
  general: [...KNOWN_TOOL_NAMES],
};

/** The tool NAMES the assistant may call in this context. */
export function toolsForContext(context: AdminPageContext): readonly ToolName[] {
  return TOOLS_BY_CONTEXT[context] ?? TOOLS_BY_CONTEXT.general;
}

// ── Per-context system-prompt addition ────────────────────────────────────────

const CONTEXT_PROMPTS: Record<AdminPageContext, string> = {
  "page-builder": `You are in the Page Builder. First DISCOVER what exists (list_components, get_component, list_pages, get_page, list_builtin_types) and match the brand/palette (get_brand_identity, get_theme). Author reusable components (create_component) and compose them into pages (create_page); to EDIT an existing one, get_component/get_page first then update_component or update_page_blocks (these REPLACE the whole artifact/block tree — re-pass everything). Always create the components a page needs BEFORE referencing them. Use 'Section' (list_builtin_types) for layout. Reference real uploaded media via list_assets. To show real collection DATA: bind one block to a single item (bind_component — first match of a query fills its props) or repeat a template component per item with a built-in List (create_list into a Section, bind_list to reconfigure one). Discover collection table names + fields with query_collection first.`,

  components: `You are in the Component library. DISCOVER existing components first (list_components, get_component). To edit one, get_component then update_component with the FULL new artifact (it replaces, not merges). Match the brand/palette (get_brand_identity, get_theme). Create new components with create_component. Reference real uploaded media via list_assets.`,

  pages: `You are on the Pages list. DISCOVER existing pages first (list_pages, get_page). Compose new pages from existing components (create_page); to change an existing page's layout, get_page then update_page_blocks with the FULL new block tree (it replaces, not merges; use 'Section' from list_builtin_types for layout). Translate page content into the site's other content locales (translate); check list_locales for the targets. Show real collection DATA on a page: bind_component (one block ← first matching item) or create_list/bind_list (repeat a template per item inside a Section); discover collection tables + fields with query_collection.`,

  settings: `You are on the Settings page. Read the current configuration first (get_brand_identity, get_theme, list_locales). You can UPDATE the brand identity (update_brand_identity — read it first, then pass the full object) and the theme colors (update_theme — pass light and/or dark token→color maps). You can also translate existing content into the site's content locales (translate).`,

  media: `You are in the Media library. Help the operator find and reference uploaded assets (list_assets) by their /media/<key> URLs.`,

  collections: `You are in Collections — the site's structured data. You can define a new typed collection (create_collection: name + typed fields; each collection gets system fields id/slug/status/created_at/updated_at automatically). You can add, update, archive/unarchive/delete items (add_collection_item / update_collection_item / archive_collection_item), and find items with structured filters/sort/search (query_collection — collections are addressed by their content_<slug> table name). Prefer query_collection to discover a collection's table name and item ids before editing. Prefer archiving over deleting.`,

  general: `You are the site's AI assistant. You can author components, compose pages, translate content, and reference uploaded media. Help the operator with whatever they need.`,
};

/** A context-specific addition appended to the base system prompt. */
export function contextPrompt(context: AdminPageContext): string {
  return CONTEXT_PROMPTS[context] ?? CONTEXT_PROMPTS.general;
}
