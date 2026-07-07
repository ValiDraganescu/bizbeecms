/**
 * Editable /llms.txt template (seo-robots goal — user-queued 2026-07-07).
 *
 * An operator can store a free-text llms.txt template in site settings. When
 * set, `/llms.txt` renders it with `{{slot}}` placeholder substitution; when
 * empty, the route falls back to today's auto-generated output (buildLlmsTxt).
 *
 * The placeholder syntax is the SAME `{{slot}}` convention components use for
 * prop interpolation — we reuse `SLOT_RE` from plan-tree.ts (identifier only,
 * optional `t ` prefix, inner whitespace) rather than inventing a new format
 * (USER REQUIREMENT). Unknown placeholders are a self-correcting validation
 * error on save that NAMES the bad token (AI error philosophy).
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`.
 * The route resolves the D1 rows + origin, builds the `LlmsTemplateVars` bag,
 * and calls `renderLlmsTemplate`.
 */

import { SLOT_RE } from "./plan-tree.ts";

/**
 * The system data available to an llms.txt template, as `{{slot}}` placeholders.
 * Each entry documents the slot for the settings-UI side panel (name + one-line
 * description + example) and is the single source of truth for BOTH the runtime
 * substitution and the on-save validation allowlist.
 */
export const LLMS_TEMPLATE_VARS = [
  {
    slot: "brandName",
    description: "The site's brand / display name.",
    example: "Acme Coffee",
  },
  {
    slot: "tagline",
    description: "The site's one-line tagline.",
    example: "Fresh roasts, daily.",
  },
  {
    slot: "origin",
    description: "The site's public origin (scheme + host, no trailing slash).",
    example: "https://acme.example",
  },
  {
    slot: "defaultLocale",
    description: "The site's default content locale code.",
    example: "en",
  },
  {
    slot: "locales",
    description: "All content locale codes, comma-separated.",
    example: "en, fi, et",
  },
  {
    slot: "pageTree",
    description:
      "The published-page list as Markdown links to each page's .md variant " +
      "(exactly today's auto-generated output).",
    example: "## Pages\n- [About](https://acme.example/about.md)",
  },
] as const;

export type LlmsTemplateSlot = (typeof LLMS_TEMPLATE_VARS)[number]["slot"];

/** The concrete values for each template slot, resolved by the route. */
export type LlmsTemplateVars = Record<LlmsTemplateSlot, string>;

/** The set of known slot names — the substitution + validation allowlist. */
const KNOWN_SLOTS: Set<string> = new Set(
  LLMS_TEMPLATE_VARS.map((v) => v.slot),
);

/**
 * Collect every DISTINCT `{{slot}}` name referenced in `template`, in first-seen
 * order. Uses the shared component SLOT_RE so the accepted syntax is identical.
 */
export function templateSlots(template: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of template.matchAll(SLOT_RE)) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Validate a template: every referenced slot must be a known variable. Returns
 * the sorted list of UNKNOWN slot names (empty = valid). The caller surfaces
 * these verbatim so the operator sees exactly which token to fix — a blank
 * template is valid (route falls back to auto output).
 */
export function unknownSlots(template: string): string[] {
  return templateSlots(template)
    .filter((name) => !KNOWN_SLOTS.has(name))
    .sort();
}

/**
 * Render a stored template by substituting every `{{slot}}` with its value from
 * `vars`. Unknown slots (which validation should have caught on save, but a
 * template could pre-date a removed var) substitute to "" rather than leaking
 * the literal `{{slot}}` into the served file. Ends with exactly one trailing
 * newline (llms.txt is a text file).
 */
export function renderLlmsTemplate(
  template: string,
  vars: LlmsTemplateVars,
): string {
  const body = template.replace(SLOT_RE, (_m, name: string) =>
    KNOWN_SLOTS.has(name) ? vars[name as LlmsTemplateSlot] ?? "" : "",
  );
  return body.endsWith("\n") ? body : body + "\n";
}
