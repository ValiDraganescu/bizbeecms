/**
 * Per-Site brand / design / AI-persona settings (Milestone 2, epic E2) — PURE module.
 *
 * A Site author describes the Site's IDENTITY once (brand name + voice, design
 * direction, an optional AI-persona instruction). Those values are stored as one
 * `site_settings` row (key `site_identity`) and folded into the AI chat system
 * prompt so every generated component/page matches the Site's identity.
 *
 * This module is PURE (no React/D1/CF imports) so it's unit-testable with the
 * project's dep-free `node --test` convention (see CAVEATS). The D1 read/write
 * lives in `db/settings-store.ts`; the chat route calls `buildSystemPrompt`.
 *
 * These values are NOT injected into HTML/CSS (unlike theme overrides) — they go
 * into the AI prompt as plain text. So there is no CSS/HTML-breakout security
 * boundary here; the only constraints are length bounds (keep the prompt sane /
 * bounded) and trimming. The prompt itself never interpolates end-user content
 * into executable artifact `script` (that boundary lives in the tool validators).
 */

// ── The settings shape ────────────────────────────────────────────────────────

export type SiteIdentity = {
  /** Brand / Site name, e.g. "Acme Coffee". */
  brandName: string;
  /** One-line tagline / what the Site is about. */
  tagline: string;
  /** Brand voice & tone, e.g. "warm, playful, plain language". */
  voice: string;
  /** Design direction, e.g. "minimal, generous whitespace, rounded cards". */
  design: string;
  /**
   * Free-form extra instruction for the AI assistant's persona/behavior, e.g.
   * "Always suggest accessible color contrast; prefer short sections".
   */
  aiPersona: string;
};

// Per-field max lengths — generous enough for real copy, bounded so a hostile or
// runaway value can't bloat the system prompt. Tagline/voice/design are short;
// persona gets more room for behavioral guidance.
const LIMITS: Record<keyof SiteIdentity, number> = {
  brandName: 120,
  tagline: 200,
  voice: 400,
  design: 400,
  aiPersona: 1000,
};

export const SITE_IDENTITY_FIELDS = Object.keys(LIMITS) as (keyof SiteIdentity)[];

export function emptySiteIdentity(): SiteIdentity {
  return { brandName: "", tagline: "", voice: "", design: "", aiPersona: "" };
}

/**
 * Validate + normalize raw identity input (parsed settings JSON or a PUT body).
 * Trims each field and clamps to its max length. Non-string / missing fields
 * become "". Never throws — garbage in → an empty identity. Extra keys dropped.
 */
export function normalizeSiteIdentity(raw: unknown): SiteIdentity {
  const out = emptySiteIdentity();
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  for (const field of SITE_IDENTITY_FIELDS) {
    const v = obj[field];
    if (typeof v !== "string") continue;
    out[field] = v.trim().slice(0, LIMITS[field]);
  }
  return out;
}

/** True when the author has filled in nothing (so the prompt can skip the block). */
export function isEmptyIdentity(identity: SiteIdentity): boolean {
  return SITE_IDENTITY_FIELDS.every((f) => identity[f] === "");
}

// ── System-prompt assembly ─────────────────────────────────────────────────────

/**
 * The fixed, always-present base instruction: WHAT the assistant is and the hard
 * rules of the artifact model (no eval, bounded utility classes, real assets via
 * list_assets, components-before-pages). The Site identity is appended on top.
 *
 * `componentNames` = the Site's existing component library (so the model reuses
 * them instead of re-authoring); `utilityClasses` = the bounded A3 vocabulary it
 * may put in `className` (arbitrary Tailwind has NO runtime CSS).
 */
/** One prop of a component definition, as folded into the system prompt. */
export type PromptPropDef = {
  name: string;
  type: string;
  required?: boolean;
  /** Per-locale text prop (a `{{t}}` slot) — must be filled in EVERY site locale. */
  translatable?: boolean;
  description?: string;
};

/** A component's DEFINITION (not its implementation) for the system prompt. */
export type PromptComponentDef = {
  name: string;
  props: PromptPropDef[];
};

/** A built-in block type (Section, …) for the system prompt. */
export type PromptBuiltinDef = {
  name: string;
  description: string;
};

/** A content collection (table name + field names) for the system prompt. */
export type PromptCollectionDef = {
  tableName: string;
  fields: string[];
};

/** Render one component definition as a compact line: `Name(prop: type!, …)`. */
function formatComponentDef(c: PromptComponentDef): string {
  if (c.props.length === 0) return `${c.name} (no props)`;
  const props = c.props
    .map((p) => {
      const req = p.required ? "!" : "";
      const t = p.translatable ? " (t)" : "";
      const desc = p.description ? ` — ${p.description}` : "";
      return `${p.name}: ${p.type}${req}${t}${desc}`;
    })
    .join("; ");
  return `${c.name} { ${props} }`;
}

export function buildSystemPrompt(opts: {
  identity?: SiteIdentity;
  /** Component DEFINITIONS (name + props) — preferred over bare names. */
  components?: PromptComponentDef[];
  /** Legacy bare-name list (used only if `components` is absent). */
  componentNames?: string[];
  /** Built-in block types (Section, …). */
  builtins?: PromptBuiltinDef[];
  /** Content collections (so the model uses the right table name, not a guess). */
  collections?: PromptCollectionDef[];
  /**
   * The Site's content locales, default first (e.g. ["en","fi","et"]). Used to tell
   * the model to fill translatable props in EVERY locale. Omitted/≤1 → no i18n rule.
   */
  locales?: string[];
  /**
   * The in-scope tool NAMES for this chat context (from `toolsForContext`).
   * When given, each guidance section ships ONLY if a tool it explains is in
   * scope — so the media/settings/collections contexts don't pay ~4k tokens of
   * component-authoring prose they can't act on. Omitted → full prompt
   * (external MCP clients and legacy callers keep everything).
   */
  tools?: readonly string[];
}): string {
  const parts: string[] = [];

  // Section gating: no `tools` list → everything ships (backward compatible).
  const has = (t: string) => !opts.tools || opts.tools.includes(t);
  const authorsComponents = has("create_component") || has("update_component");
  const composesPages = has("create_page") || has("update_page_blocks");

  // Opening: toolbox-generic on purpose — the in-scope tool set varies per
  // context, so naming specific tools here would go stale/out-of-scope again.
  parts.push(
    "You are the AI website builder for a CMS Site. You act by CALLING TOOLS " +
      "— every real change to the Site (components, pages, content, " +
      "translations, data, media, settings) happens through a tool call; your " +
      "toolbox varies with the admin page you're on. ALWAYS deliver work by " +
      "calling the tool with the full arguments. NEVER paste a component or " +
      "page as a code block in your chat reply: text in the message is inert, " +
      "it does NOT change the Site. Your reply is for talking to the operator " +
      "(a short summary of what you changed); the tool call is what actually " +
      "builds.",
  );

  if (composesPages)
    parts.push(
      "Pages are composed from components: create_page authors a new page's " +
        "block tree; update_page_blocks REPLACES an existing one. Every " +
        "component a page references must already exist BEFORE you compose it " +
        "— a page naming an unknown component is rejected.",
    );

  parts.push(
    "Follow the user's instructions as closely as possible. Do exactly what " +
      "they ask — no more, no less. If a request is ambiguous or would mean " +
      "more than they asked for (e.g. they say one section, not three), ask " +
      "before doing extra. Don't add, remove, or restructure things they " +
      "didn't request. Talk like a colleague who's already on the job, not a " +
      "stranger being introduced — you know this operator and this Site, so " +
      "skip 'nice to meet you' and 'how can I help'. To a greeting or small " +
      "talk, just reply warmly in a sentence and stay ready — don't recite a " +
      "menu of what you can do or list example tasks unless the operator asks " +
      "what's possible. Keep it professional and plain: these are designers " +
      "and marketing people, not engineers. NEVER mention the tools you " +
      "called or any technical/implementation detail (artifacts, props, " +
      "slots, Tailwind, the render pipeline) — the operator already sees " +
      "which tools ran. Describe what changed on the site in their terms.",
  );

  if (authorsComponents)
  parts.push(
    "Component `html` is parsed and rendered server-side as a data walk — never " +
      "assume any JavaScript eval runs on the server. Author plain HTML: tags, " +
      "attributes (use `class` for utilities, `style` for one-offs), and nested " +
      "elements. Write STANDARD HTML/SVG attribute names — lowercase and " +
      "hyphenated (class, stroke-width, stroke-linecap, viewBox, for) — NOT React " +
      "/JSX names (className, strokeWidth). For interactivity, put ALL of it in the " +
      "component `script` (trusted, runs in the browser) and wire it up there by " +
      "selecting elements (e.g. data-* hooks) — scope every lookup to THIS " +
      "component's own data-* hooks and never reach into markup other components " +
      "render (pages compose components freely, so foreign markup may not exist " +
      "on the page). Do NOT use inline event-handler " +
      "attributes like onclick/onsubmit in the html; they are stripped at render. " +
      "Reference another component by its PascalCase tag, e.g. " +
      "`<AuthorCard name=\"{{author}}\"></AuthorCard>`. " +
      "Write text content as REAL Unicode characters, NOT HTML entities: the parser " +
      "does NOT decode entities, so `&rarr;` or `&#9788;` render as literal text. " +
      "Use the actual glyph (→, ☽, —, ·, ©) directly in the markup.",
  );

  if (authorsComponents)
  parts.push(
    "Mark every spot that takes page content with a slot in the html: " +
      "`{{propName}}` for a plain value and `{{t propName}}` for a TRANSLATABLE " +
      "value (slots work in text and in attribute values). For EVERY slot you " +
      "use, declare it in `propsSchema` as { propName: { type, default } } " +
      "(set translatable:true for `{{t}}` slots) — and make `default` " +
      "REALISTIC PLACEHOLDER DATA (a real-sounding title, a full sentence of body " +
      "copy, an actual price like \"$29\", a sample image URL), not the prop name " +
      "or 'TODO'. This placeholder data is what renders in the component preview, " +
      "so a component must look complete on its own. " +
      "For a TRANSLATABLE prop (translatable:true), the `default` MUST itself be a " +
      "per-locale OBJECT with the text written in EVERY Site locale, e.g. " +
      "default:{ \"en\":\"Our restaurants\", \"fi\":\"Ravintolamme\" } — translate the " +
      "placeholder copy yourself into each language; a single bare string leaves the " +
      "other locales blank in the preview and on any page that doesn't override the " +
      "prop. (The exact locale list is given below for multi-language Sites.) " +
      "type is one of " +
      "string|richtext|number|boolean|select|image|link|icon. Use type:\"image\" for any prop " +
      "that holds an asset/image URL (e.g. a background or photo) — the editor then " +
      "shows a media-gallery picker instead of a text box, and the default should be " +
      "a real /media asset URL from list_assets. Use type:\"link\" for any prop that holds " +
      "a URL used as an anchor href (e.g. ctaHref, link1Href) — the editor then offers a " +
      "page picker + free text + an \"open in new tab\" toggle. Author the anchor plainly " +
      "as <a href=\"{{ctaHref}}\">…</a>; the renderer AUTOMATICALLY adds target=\"_blank\" " +
      "rel=\"noopener noreferrer\" when the operator enables new-tab (via a companion " +
      "flag) — do NOT add target/rel yourself and do NOT declare a *NewTab prop. Omit " +
      "propsSchema only for a fully static component with no slots. " +
      "When you need a NEW image, call generate_image (it saves to the gallery and " +
      "returns a /media URL). For a subject meant to sit directly ON a section " +
      "background (a logo, icon, product or food illustration) — not a full-bleed " +
      "photo backdrop — pass transparentBackground:true so it's a clean cut-out with " +
      "no white box around it.",
  );

  if (authorsComponents && has("edit_text"))
  parts.push(
    "To MODIFY an existing component, PREFER edit_text over a full re-author: " +
      "get_component to read it, then replace just the snippet you're changing " +
      "(oldString → newString) in component.html, component.script, or " +
      "component.css. Every edit passes the same validation as a full update, so " +
      "a patch that would break the markup is rejected with the reason. Reach for " +
      "update_component ONLY when restructuring the component wholesale, or when " +
      "several edit_text attempts in a row could not apply (snippet not found or " +
      "ambiguous).",
  );

  if (authorsComponents)
  parts.push(
    "ICONS: to place a vector icon, use an `{{icon \"name\"}}` slot — a SEPARATE " +
      "slot from `{{prop}}` (the icon name is QUOTED, e.g. " +
      "`<span class=\"inline-flex h-5 w-5\">{{icon \"calendar\"}}</span>`). The name " +
      "resolves to an inline SVG from the SITE'S SELECTED ICON SET (chosen in " +
      "Settings — do NOT include a set prefix). Icons are monochrome and inherit the " +
      "parent's text color (a theme token), so size them on the WRAPPER with Tailwind " +
      "(h-5 w-5, text-primary, etc.). To make the icon EDITABLE by the operator, " +
      "declare an `icon`-typed prop and reference it UNQUOTED: " +
      "`{{icon glyph}}` with propsSchema { glyph: { type: \"icon\", default: \"calendar\" } } " +
      "— the editor then shows an icon picker. ALWAYS call `search_icons` to confirm a " +
      "name exists in the current set before using it; use the returned name verbatim. " +
      "An unknown icon simply renders nothing.",
  );

  if (authorsComponents)
  parts.push(
    "For `className` use any standard Tailwind utility — the full Tailwind is " +
      "compiled per page at render time, so variants (hover:, focus:, md:, " +
      "dark:), the complete scales, and arbitrary values (h-[37px], " +
      "grid-cols-[1fr_2fr]) all work for LAYOUT. " +
      "COLORS: use ONLY the Site's theme tokens — NEVER a raw palette name " +
      "(zinc-950, green-700, amber-200) or a hex/oklch literal (bg-[#0af]). The " +
      "tokens are: surface, surface-muted, surface-raised, foreground, " +
      "foreground-muted, border, primary, primary-hover, primary-foreground, " +
      "primary-subtle, danger, success, warning, info (each with its -foreground / " +
      "-subtle variants), and ring. Use them as bg-/text-/border-/from-/to-/via- " +
      "utilities (bg-surface, text-foreground, text-primary, border-border, " +
      "from-foreground). Opacity modifiers on a token are fine (text-surface/80, " +
      "bg-foreground/60). For a DARK panel (e.g. a hero over a photo), build it from " +
      "tokens: bg-foreground as the dark base, from-foreground gradients to darken " +
      "the image, text-surface for the light text on top, text-primary for accents " +
      "— so it stays correct in both light and dark mode and follows the brand. " +
      "FONTS work the same way: never a literal font-family. The theme's font slots " +
      "are font-body (the default — rarely needed explicitly), font-heading " +
      "(h1–h6 get it automatically) and font-accent (opt-in, for a highlighted " +
      "word or a hero line). Use font-accent when a design calls for a distinct " +
      "display/script face; the operator picks the actual families in Theme settings.",
  );

  const builtins = opts.builtins ?? [];
  if (composesPages && builtins.length > 0) {
    parts.push(
      "Built-in block types (use directly in a page's block tree — no need to " +
        "create them):\n" +
        builtins.map((b) => `- ${b.name}: ${b.description}`).join("\n"),
    );
  }

  // ponytail: hard caps so a 200-component/50-collection site can't silently
  // re-bloat the prompt; the overflow line points at the paged discovery tool.
  const MAX_PROMPT_COMPONENTS = 60;
  const MAX_PROMPT_COLLECTIONS = 30;

  const defs = opts.components ?? [];
  const names = opts.componentNames ?? [];
  const buildsWithComponents = authorsComponents || composesPages;
  if (!buildsWithComponents) {
    /* non-building context (media/settings/collections) — no component list */
  } else if (defs.length > 0) {
    const shown = defs.slice(0, MAX_PROMPT_COMPONENTS);
    const moreDefs = defs.length - shown.length;
    parts.push(
      "This Site's existing components (reuse them when they fit; props shown — " +
        "`!` = required, `(t)` = translatable). Set these props when you place a " +
        "component in a page; do NOT call get_component just to learn props — they're " +
        "listed here:\n" +
        shown.map((c) => `- ${formatComponentDef(c)}`).join("\n") +
        (moreDefs > 0 ? `\n…and ${moreDefs} more — use list_components to see the rest.` : ""),
    );
  } else if (names.length > 0) {
    const shown = names.slice(0, MAX_PROMPT_COMPONENTS);
    const moreNames = names.length - shown.length;
    parts.push(
      `This Site already has these components — reuse them when they fit: ${shown.join(", ")}` +
        (moreNames > 0 ? ` …and ${moreNames} more (use list_components).` : "."),
    );
  } else {
    parts.push("This Site has no components yet — create the ones each page needs.");
  }

  // Multi-locale sites: translatable (`(t)`) props must be filled in EVERY locale.
  // The rule is about writing PROPS (blocks + propsSchema defaults), so it ships
  // only where a prop-writing tool is in scope — bare `translate` doesn't need it.
  const writesTranslatable =
    authorsComponents || composesPages || has("set_block_props");
  const locales = (opts.locales ?? []).filter((l) => typeof l === "string" && l);
  if (writesTranslatable && locales.length > 1) {
    const [def] = locales;
    const example = `{ ${locales.map((l) => `"${l}":"…"`).join(", ")} }`;
    parts.push(
      `This Site publishes in ${locales.length} languages: ${locales.join(", ")} ` +
        `(default ${def}). For ANY translatable prop (marked \`(t)\` above, from a ` +
        `\`{{t}}\` slot) that you set on a page block — with set_block_props, ` +
        `create_page, or update_page_blocks — pass its value as a LOCALE OBJECT with ` +
        `text for ALL ${locales.length} locales, e.g. props:{ "title": ${example} }. ` +
        `Do NOT set just the ${def} string on a block translatable prop and expect a ` +
        `later step to fill the rest: a one-language value renders the raw text for the ` +
        `missing locales. You must SUPPLY every translation yourself (translate the copy ` +
        `into ${locales.join(", ")}). This applies EQUALLY to a translatable prop's ` +
        `\`default\` in a component's propsSchema — author it as the same locale object ` +
        `${example} so the component preview and any page using it render in all ` +
        `${locales.length} languages. Non-translatable props (no \`(t)\`) take a single ` +
        `plain value, not a locale object.`,
    );
  }

  const collections = opts.collections ?? [];
  const usesCollections =
    has("query_collection") || has("bind_component") || has("bind_list");
  if (usesCollections && collections.length > 0) {
    const shown = collections.slice(0, MAX_PROMPT_COLLECTIONS);
    const moreCols = collections.length - shown.length;
    parts.push(
      "This Site's content collections (pass the EXACT table name to " +
        "query_collection / bind_component / bind_list — do NOT guess the bare " +
        "label, the tables are prefixed `content_`):\n" +
        shown
          .map((c) => `- ${c.tableName} (${c.fields.join(", ") || "no user fields"})`)
          .join("\n") +
        (moreCols > 0
          ? `\n…and ${moreCols} more — query_collection with an unknown table name lists them all.`
          : ""),
    );
  }

  if (has("list_assets"))
  parts.push(
    "When a design references an image, call list_assets and use a returned " +
      "/media/<key> URL — never invent image URLs.",
  );

  if (has("set_block_props"))
  parts.push(
    "Editing an EXISTING page's content: to change a block's text or props (a hero " +
      "title, a button label, an image), call set_block_props with the page id, the " +
      "block's `id` (from get_page), and a `props` object holding the prop name→value " +
      "pairs to set. The `props` object MUST be NON-EMPTY and contain the actual new " +
      "values — e.g. to set a hero's text: props:{ \"title\":\"Find the restaurant you " +
      "like\", \"subtitle\":\"Make reservations…\" }. Use the prop NAMES from the " +
      "component's prop list above (e.g. Hero has title, subtitle, …). Send only the " +
      "props you're changing (they merge in; the rest are kept) — but ALWAYS send at " +
      "least the ones you're setting; an empty props:{} changes nothing and is " +
      "rejected. Do NOT use update_page_blocks for a text/prop tweak: it FULL-REPLACES " +
      "the page, so any section or block you don't re-pass is DELETED. Reserve " +
      "update_page_blocks for actually adding, removing, reordering, or restructuring " +
      "blocks — and even then, get_page FIRST and re-pass the whole current tree with " +
      "your change applied, never a partial tree.",
  );

  if (has("bind_list"))
  parts.push(
    "Selects/comboboxes are a List block, NOT a component: a List with " +
      "presentation:\"combobox\" stamps its item component per row inside a " +
      "selectable dropdown and owns selection/search/limits. To change ANYTHING " +
      "about a select/combobox (the selected-item chip text, single vs multiple, " +
      "min/max, search, value/label field, placeholder), call bind_list on that " +
      "List block — do NOT update_component the item component, and do NOT rebuild " +
      "the whole page. The 'selection expression' is bind_list's `labelExpr` " +
      "(a template over the row using ${field}, e.g. \"${name} · ${location}\" — " +
      "plain text, no backticks); a single field is `labelField`. Pass only the " +
      "fields you're changing.",
  );

  if (has("bind_list"))
  parts.push(
    "A plain List (presentation:\"list\", the default) also has LAYOUT options on " +
      "bind_list: `direction` = \"vertical\" (default), \"horizontal\", or \"grid\"; " +
      "`gap` px spaces the items. For grid, `columns` is the DESKTOP count (default 2) " +
      "and `columnsTablet`/`columnsMobile` optionally override it at tablet (768–1023px) " +
      "and mobile (≤767px) — omit them to keep the same count everywhere. `maxSize` px " +
      "caps the scroll axis (height for vertical/grid, width for horizontal) so overflow " +
      "scrolls; `autoscroll:true` loops the content seamlessly with `autoscrollSpeed` " +
      "\"slow\"|\"normal\"|\"fast\". Set these via bind_list — do NOT bake scroll/grid CSS " +
      "into the item component.",
  );

  const id = opts.identity;
  if (id && !isEmptyIdentity(id)) {
    const lines: string[] = [];
    if (id.brandName) lines.push(`- Brand name: ${id.brandName}`);
    if (id.tagline) lines.push(`- Tagline: ${id.tagline}`);
    if (id.voice) lines.push(`- Brand voice/tone: ${id.voice}`);
    if (id.design) lines.push(`- Design direction: ${id.design}`);
    if (id.aiPersona) lines.push(`- Extra instructions: ${id.aiPersona}`);
    parts.push(
      "Match this Site's identity in everything you generate (copy, layout, " +
        "naming):\n" +
        lines.join("\n"),
    );
  }

  return parts.join("\n\n");
}
