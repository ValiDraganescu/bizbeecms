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
  | "general";

const KNOWN_CONTEXTS: AdminPageContext[] = [
  "page-builder",
  "components",
  "pages",
  "settings",
  "media",
];

// The tools that EXIST in bizbee today (must match each tool's function.name).
// Slice 3 adds more; extend TOOLS_BY_CONTEXT when their backends land.
export const KNOWN_TOOL_NAMES = [
  "create_component",
  "create_page",
  "translate",
  "list_assets",
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

// ── Tool scoping (by tool name) ───────────────────────────────────────────────

/**
 * Tool names available per context. Each maps to the EXISTING bizbee tools only
 * — a name with no backend would be a dead tool (see CAVEATS). "general" gets
 * everything (the assistant on a non-builder page can still do anything).
 */
const TOOLS_BY_CONTEXT: Record<AdminPageContext, readonly ToolName[]> = {
  // Building pages: author components, compose pages, reference media.
  "page-builder": ["create_component", "create_page", "list_assets"],
  // Component playground: just author/reference components + media.
  components: ["create_component", "list_assets"],
  // Pages list: compose pages from components, translate page content.
  pages: ["create_page", "translate", "list_assets"],
  // Settings: content-locale translation is the only existing settings-ish tool;
  // brand/theme tools land in Slice 3.
  settings: ["translate"],
  // Media library: list assets (upload/serve UI is separate).
  media: ["list_assets"],
  // Anywhere else: full toolset.
  general: [...KNOWN_TOOL_NAMES],
};

/** The tool NAMES the assistant may call in this context. */
export function toolsForContext(context: AdminPageContext): readonly ToolName[] {
  return TOOLS_BY_CONTEXT[context] ?? TOOLS_BY_CONTEXT.general;
}

// ── Per-context system-prompt addition ────────────────────────────────────────

const CONTEXT_PROMPTS: Record<AdminPageContext, string> = {
  "page-builder": `You are in the Page Builder. Help the operator build and modify pages: author reusable components (create_component) and compose them into pages (create_page). Always create the components a page needs BEFORE create_page. Reference real uploaded media via list_assets.`,

  components: `You are in the Component library. Help the operator author and refine reusable UI components with create_component. Reference real uploaded media via list_assets.`,

  pages: `You are on the Pages list. Help the operator compose pages from existing components (create_page) and translate page content into the site's other content locales (translate).`,

  settings: `You are on the Settings page. Help the operator configure the site. You can translate existing content into the site's other content locales (translate). Brand identity and theme are edited in the settings forms.`,

  media: `You are in the Media library. Help the operator find and reference uploaded assets (list_assets) by their /media/<key> URLs.`,

  general: `You are the site's AI assistant. You can author components, compose pages, translate content, and reference uploaded media. Help the operator with whatever they need.`,
};

/** A context-specific addition appended to the base system prompt. */
export function contextPrompt(context: AdminPageContext): string {
  return CONTEXT_PROMPTS[context] ?? CONTEXT_PROMPTS.general;
}
