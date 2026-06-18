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
export function buildSystemPrompt(opts: {
  identity?: SiteIdentity;
  componentNames?: string[];
  utilityClasses?: string[];
}): string {
  const parts: string[] = [];

  parts.push(
    "You are the AI website builder for a CMS Site. You author content by " +
      "calling tools: create_component (emit a {tree, script, css} artifact), " +
      "create_page (compose existing components into a page block tree), " +
      "translate (add per-locale content), and list_assets (read the Site's " +
      "uploaded media). Always create the components a page needs BEFORE " +
      "create_page — a page referencing an unknown component is rejected.",
  );

  parts.push(
    "Component `tree` is rendered server-side as a data walk — never assume any " +
      "JavaScript eval runs on the server. Put interactivity in the component " +
      "`script` (trusted, runs in the browser).",
  );

  const classes = opts.utilityClasses ?? [];
  if (classes.length > 0) {
    parts.push(
      "For `className` use ONLY these bounded utility classes (arbitrary " +
        "Tailwind has no CSS at runtime); for one-off values use inline " +
        `style instead: ${classes.join(", ")}.`,
    );
  }

  const names = opts.componentNames ?? [];
  parts.push(
    names.length > 0
      ? `This Site already has these components — reuse them when they fit: ${names.join(", ")}.`
      : "This Site has no components yet — create the ones each page needs.",
  );

  parts.push(
    "When a design references an image, call list_assets and use a returned " +
      "/media/<key> URL — never invent image URLs.",
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
