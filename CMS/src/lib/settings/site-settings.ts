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
}): string {
  const parts: string[] = [];

  parts.push(
    "You are the AI website builder for a CMS Site. You author content by " +
      "calling tools: create_component (emit an {html, script, css} artifact — " +
      "the html is the component markup), create_page (compose existing " +
      "components into a page block tree), translate (add per-locale content), " +
      "and list_assets (read the Site's uploaded media). Always create the " +
      "components a page needs BEFORE create_page — a page referencing an " +
      "unknown component is rejected. ALWAYS deliver an artifact by CALLING the " +
      "tool — put the html/script/css in the tool arguments. NEVER paste a " +
      "component or page as a code block in your chat reply: text in the message " +
      "is inert, it does NOT change the Site. Your reply is for talking to the " +
      "operator (a short summary of what you changed); the tool call is what " +
      "actually builds.",
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
      "what's possible.",
  );

  parts.push(
    "Component `html` is parsed and rendered server-side as a data walk — never " +
      "assume any JavaScript eval runs on the server. Author plain HTML: tags, " +
      "attributes (use `class` for utilities, `style` for one-offs), and nested " +
      "elements. Write STANDARD HTML/SVG attribute names — lowercase and " +
      "hyphenated (class, stroke-width, stroke-linecap, viewBox, for) — NOT React " +
      "/JSX names (className, strokeWidth). For interactivity, put ALL of it in the " +
      "component `script` (trusted, runs in the browser) and wire it up there by " +
      "selecting elements (e.g. data-* hooks) — do NOT use inline event-handler " +
      "attributes like onclick/onsubmit in the html; they are stripped at render. " +
      "Reference another component by its PascalCase tag, e.g. " +
      "`<AuthorCard name=\"{{author}}\"></AuthorCard>`.",
  );

  parts.push(
    "Mark every spot that takes page content with a slot in the html: " +
      "`{{propName}}` for a plain value and `{{t propName}}` for a TRANSLATABLE " +
      "value (slots work in text and in attribute values). For EVERY slot you " +
      "use, declare it in `propsSchema` as { propName: { type, default } } " +
      "(set translatable:true for `{{t}}` slots) — and make `default` " +
      "REALISTIC PLACEHOLDER DATA (a real-sounding title, a full sentence of body " +
      "copy, an actual price like \"$29\", a sample image URL), not the prop name " +
      "or 'TODO'. This placeholder data is what renders in the component preview, " +
      "so a component must look complete on its own. type is one of " +
      "string|richtext|number|boolean|select|image. Use type:\"image\" for any prop " +
      "that holds an asset/image URL (e.g. a background or photo) — the editor then " +
      "shows a media-gallery picker instead of a text box, and the default should be " +
      "a real /media asset URL from list_assets. Omit propsSchema only for a fully " +
      "static component with no slots.",
  );

  parts.push(
    "For `className` use any standard Tailwind utility — the full Tailwind is " +
      "compiled per page at render time, so variants (hover:, focus:, md:, " +
      "dark:), the complete scales, and arbitrary values (h-[37px], bg-[#0af], " +
      "grid-cols-[1fr_2fr]) all work. Prefer the purpose color tokens " +
      "(bg-primary, text-foreground, border-border) so the Site theme drives " +
      "light/dark — avoid raw palette names (blue-500) for themed surfaces.",
  );

  const builtins = opts.builtins ?? [];
  if (builtins.length > 0) {
    parts.push(
      "Built-in block types (use directly in a page's block tree — no need to " +
        "create them):\n" +
        builtins.map((b) => `- ${b.name}: ${b.description}`).join("\n"),
    );
  }

  const defs = opts.components ?? [];
  const names = opts.componentNames ?? [];
  if (defs.length > 0) {
    parts.push(
      "This Site's existing components (reuse them when they fit; props shown — " +
        "`!` = required, `(t)` = translatable). Set these props when you place a " +
        "component in a page; do NOT call get_component just to learn props — they're " +
        "listed here:\n" +
        defs.map((c) => `- ${formatComponentDef(c)}`).join("\n"),
    );
  } else if (names.length > 0) {
    parts.push(
      `This Site already has these components — reuse them when they fit: ${names.join(", ")}.`,
    );
  } else {
    parts.push("This Site has no components yet — create the ones each page needs.");
  }

  // Multi-locale sites: translatable (`(t)`) props must be filled in EVERY locale.
  const locales = (opts.locales ?? []).filter((l) => typeof l === "string" && l);
  if (locales.length > 1) {
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
        `into ${locales.join(", ")}). Non-translatable props (no \`(t)\`) take a single ` +
        `plain value, not a locale object.`,
    );
  }

  const collections = opts.collections ?? [];
  if (collections.length > 0) {
    parts.push(
      "This Site's content collections (pass the EXACT table name to " +
        "query_collection / bind_component / bind_list — do NOT guess the bare " +
        "label, the tables are prefixed `content_`):\n" +
        collections
          .map((c) => `- ${c.tableName} (${c.fields.join(", ") || "no user fields"})`)
          .join("\n"),
    );
  }

  parts.push(
    "When a design references an image, call list_assets and use a returned " +
      "/media/<key> URL — never invent image URLs.",
  );

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
