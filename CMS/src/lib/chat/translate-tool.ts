/**
 * The fourth AI tool: translate page/component content (Milestone 2, epic B4).
 *
 * After authoring components (B2) and composing pages (B3), the AI fills the
 * site's OTHER content locales. Localized content is stored INLINE as "locale
 * objects" — `{ "en": "Pricing", "fi": "Hinnoittelu" }` — which the renderer's
 * `resolveLocalized` (C1) already resolves at request time. So "translating" is
 * just: take the existing default-locale text for a field and add the other
 * locales' values to its locale object.
 *
 * This module owns the two PURE, offline-testable concerns of that tool,
 * mirroring `component-tool.ts` / `page-tool.ts`:
 *
 *  1. `CREATE_TRANSLATION_TOOL` — the OpenAI-style function/tool schema handed
 *     to the model call (`Ai.chat({ tools })`).
 *  2. `validateTranslationInput` — the security/correctness gate on the model's
 *     UNTRUSTED output. It validates the target kind+name and the `fields` map:
 *     each value must be a LOCALE OBJECT (all keys valid locale codes, all leaf
 *     values strings) and — when the route passes the Site's `allowedLocales`
 *     (from `getContentLocales`) — every code must be in that set. PURE — never
 *     throws, never writes.
 *
 * The validator can't know which page/component EXISTS or what its current
 * fields are (that needs the D1 binding), so the route looks the target up and
 * the D1 write (`db/translate-store.ts`) MERGES these locale objects into the
 * stored artifact. This module is PURE (no React/D1/CF imports) so it's
 * unit-tested with the project's dep-free `node --test` (see CAVEATS).
 */

// Relative (not @/) imports so this stays node-testable (see CAVEATS).
import { isValidLocaleCode, normalizeLocaleCode } from "../render/localize.ts";

export type TranslateTargetKind = "page" | "component";

/** One field's per-locale values, e.g. { en: "Pricing", fi: "Hinnoittelu" }. */
export type LocaleStringMap = Record<string, string>;

/** The validated, ready-to-merge translation input. */
export interface TranslationInput {
  kind: TranslateTargetKind;
  /** Page slug (kind=page) or component name (kind=component). */
  target: string;
  /**
   * Field path → locale-string map. For a page: `metaTitle`, `metaDescription`,
   * or a block-prop path `<blockId>.<propName>`. For a component: a tree text
   * path is out of scope here — components translate via block props at use
   * sites; we accept arbitrary string field names and the store decides.
   */
  fields: Record<string, LocaleStringMap>;
}

// Same lax slug/name vocabulary the other tools accept (page slugs are
// lowercase URL segments; component names are PascalCase-ish). We don't
// re-validate the exact regex here — the target only has to be a non-empty
// reference; the route's D1 lookup is the real existence check.
const MAX_FIELD_TEXT_BYTES = 16 * 1024;

/**
 * The tool schema handed to the model. OpenAI/Workers-AI function-calling shape.
 * `fields` is described as a JSON object; open models often emit it as a string,
 * so the validator accepts an object OR a JSON string of one (see `coerceObject`).
 */
export const CREATE_TRANSLATION_TOOL = {
  type: "function" as const,
  function: {
    name: "translate",
    description:
      "Translate an existing page or component's content into the site's other " +
      "content locales. Content is stored as per-locale objects like " +
      '{ "en": "Pricing", "fi": "Hinnoittelu" }. Provide, per field, the value ' +
      "in EACH supported locale (include the source locale too). For pages, " +
      "fields are 'metaTitle', 'metaDescription', or a block prop named " +
      "'<blockId>.<propName>'. Only use the site's configured locale codes.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["page", "component"],
          description: "What to translate: a 'page' (by slug) or a 'component' (by name).",
        },
        target: {
          type: "string",
          description:
            "The page slug (kind=page) or component name (kind=component) to translate.",
        },
        fields: {
          type: "object",
          description:
            "Map of field path → per-locale values, e.g. " +
            '{ "metaTitle": { "en": "Pricing", "fi": "Hinnoittelu" } }. Each ' +
            "value is an object keyed by locale code with string values.",
        },
      },
      required: ["kind", "target", "fields"],
    },
  },
};

export interface ValidateOpts {
  /**
   * The Site's configured content-locale codes (from `getContentLocales`). When
   * present, every locale key in `fields` must be one of these — so the model
   * can't invent locales the Site doesn't serve. Omit to accept any valid code.
   */
  allowedLocales?: string[];
}

/**
 * Validate a raw tool-call argument object into a mergeable translation input,
 * or return the problems (which the route relays back to the model). PURE —
 * never throws, never writes. Does NOT verify the target EXISTS (no D1 here).
 */
export function validateTranslationInput(
  args: unknown,
  opts: ValidateOpts = {},
): { ok: true; input: TranslationInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (typeof args !== "object" || args === null) {
    return { ok: false, errors: ["tool arguments must be a JSON object"] };
  }
  const a = args as Record<string, unknown>;

  // ── kind ──
  let kind: TranslateTargetKind | null = null;
  if (a.kind === "page" || a.kind === "component") {
    kind = a.kind;
  } else {
    errors.push("kind must be 'page' or 'component'");
  }

  // ── target ──
  const target = typeof a.target === "string" ? a.target.trim() : "";
  if (target === "") {
    errors.push("target must be a non-empty page slug or component name");
  }

  // ── allowedLocales (normalize once for membership checks) ──
  const allowed =
    opts.allowedLocales && opts.allowedLocales.length > 0
      ? new Set(opts.allowedLocales.map(normalizeLocaleCode))
      : null;

  // ── fields ── (accept object or JSON string of one)
  const fieldsRaw = coerceObject(a.fields);
  const fields: Record<string, LocaleStringMap> = {};
  if (fieldsRaw === undefined) {
    errors.push("fields must be a JSON object of fieldName → locale map (or a JSON string of one)");
  } else if (Object.keys(fieldsRaw).length === 0) {
    errors.push("fields must contain at least one field to translate");
  } else {
    for (const [field, rawMap] of Object.entries(fieldsRaw)) {
      const map = validateLocaleMap(field, rawMap, allowed, errors);
      if (map) fields[field] = map;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, input: { kind: kind!, target, fields } };
}

/**
 * Validate one field's locale map: must be a non-empty object, every key a
 * valid (and, if constrained, allowed) locale code, every value a bounded
 * string. Returns the normalized map (locale codes lowercased) or null on error
 * (errors are pushed). Mirrors the locale-object contract `resolveLocalized`
 * relies on so a translated field actually renders.
 */
function validateLocaleMap(
  field: string,
  raw: unknown,
  allowed: Set<string> | null,
  errors: string[],
): LocaleStringMap | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`fields["${field}"] must be an object of locale code → string`);
    return null;
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    errors.push(`fields["${field}"] must have at least one locale`);
    return null;
  }
  const out: LocaleStringMap = {};
  for (const [code, value] of entries) {
    const norm = normalizeLocaleCode(code);
    if (!isValidLocaleCode(norm)) {
      errors.push(`fields["${field}"]: "${code}" is not a valid locale code`);
      continue;
    }
    if (allowed && !allowed.has(norm)) {
      errors.push(
        `fields["${field}"]: locale "${code}" is not a configured site content locale ` +
          `(use one of: ${[...allowed].join(", ")})`,
      );
      continue;
    }
    if (typeof value !== "string") {
      errors.push(`fields["${field}"]["${code}"] must be a string`);
      continue;
    }
    if (byteLength(value) > MAX_FIELD_TEXT_BYTES) {
      errors.push(`fields["${field}"]["${code}"] exceeds ${MAX_FIELD_TEXT_BYTES} bytes`);
      continue;
    }
    out[norm] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Accept a plain object, or a JSON string of one; undefined if neither. */
function coerceObject(raw: unknown): Record<string, unknown> | undefined {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

// ── Pure page-field merge (the D1 write's brain; kept here so it's node-testable)

export interface PageDoc {
  blocks: unknown[];
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
}

export interface MergeOutcome extends PageDoc {
  applied: number;
  errors: string[];
}

interface BlockShape {
  id?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
  [k: string]: unknown;
}

/**
 * PURE merge of translation `fields` into a page document. `metaTitle` /
 * `metaDescription` merge into the meta maps; `<blockId>.<propName>` sets that
 * block's prop to a locale object (merging with an existing one). An unknown
 * meta field or a missing block/path is reported (not silently dropped) so the
 * model learns the real field names. Never mutates the input.
 */
export function mergePageFields(
  doc: PageDoc,
  fields: Record<string, LocaleStringMap>,
): MergeOutcome {
  const errors: string[] = [];
  let applied = 0;

  // Deep-clone so the merge is non-mutating (inputs come from JSON.parse anyway).
  const blocks = structuredClone(doc.blocks);
  const metaTitle = { ...doc.metaTitle };
  const metaDescription = { ...doc.metaDescription };

  const byId = indexBlocks(blocks);

  for (const [field, localeMap] of Object.entries(fields)) {
    if (field === "metaTitle") {
      Object.assign(metaTitle, localeMap);
      applied++;
    } else if (field === "metaDescription") {
      Object.assign(metaDescription, localeMap);
      applied++;
    } else {
      const dot = field.indexOf(".");
      if (dot <= 0 || dot === field.length - 1) {
        errors.push(
          `unknown field "${field}" (use metaTitle, metaDescription, or "<blockId>.<propName>")`,
        );
        continue;
      }
      const blockId = field.slice(0, dot);
      const propName = field.slice(dot + 1);
      const block = byId.get(blockId);
      if (!block) {
        errors.push(`block "${blockId}" not found on this page`);
        continue;
      }
      const props = (block.props ??= {}) as Record<string, unknown>;
      const existing = props[propName];
      const base =
        existing && typeof existing === "object" && !Array.isArray(existing)
          ? (existing as Record<string, unknown>)
          : {};
      props[propName] = { ...base, ...localeMap };
      applied++;
    }
  }

  return { blocks, metaTitle, metaDescription, applied, errors };
}

/** Build a blockId → block map, walking nested `children`. */
function indexBlocks(blocks: unknown[]): Map<string, BlockShape> {
  const map = new Map<string, BlockShape>();
  walk(blocks);
  return map;

  function walk(list: unknown[]): void {
    for (const b of list) {
      if (typeof b !== "object" || b === null) continue;
      const block = b as BlockShape;
      if (typeof block.id === "string") map.set(block.id, block);
      if (Array.isArray(block.children)) walk(block.children);
    }
  }
}
