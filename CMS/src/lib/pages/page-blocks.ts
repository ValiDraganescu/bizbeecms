/**
 * Pure block-tree edit logic for the visual block editor (Milestone 2, epic C3)
 * — the NON-AI counterpart to the B3 `create_page` tool's block authoring.
 *
 * C2 (`page-meta.ts`) edits a page's METADATA and deliberately leaves blocks
 * alone. C3 is the missing half: visually compose/reorder a page's block tree.
 * This module owns the PURE concerns of that editor (so they're unit-tested with
 * the project's dep-free `node --test`):
 *
 *  - `validateBlocks` — gate a raw blocks array (from the editor OR the REST
 *    body, both untrusted) into a persistable `Block[]`, reusing the renderer's
 *    own `planPage` to reject anything un-renderable. Mirrors `page-tool.ts`'s
 *    block check but standalone (no slug/parent/meta — those are C2's).
 *  - `addBlock` / `removeBlock` / `moveBlock` — the immutable edit operations the
 *    editor's add / remove / reorder buttons apply to the TOP-LEVEL block list.
 *
 * One nesting level only this slice (top-level blocks). Block.children authored
 * by the AI's create_page still round-trip untouched (validate/persist walk the
 * whole tree); the visual editor just doesn't expose nested editing yet.
 *
 * PURE (no React / D1 / CF imports). Relative `.ts` import keeps it node-loadable.
 */

import {
  planPage,
  SECTION_COMPONENT,
  SECTION_ROW_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  LIST_COMPONENT,
  FORM_COMPONENT,
  GUEST_CHAT_COMPONENT,
  isBuiltinComponent,
  type Block,
} from "../render/tree.ts";
import { isLocaleObject } from "../render/localize.ts";

// Re-export so the editor/UI keeps importing the reserved names from here (the
// renderer in tree.ts owns the single definitions, so both layers agree).
export { SECTION_COMPONENT, SECTION_ROW_COMPONENT, SECTION_COLUMN_COMPONENT, LIST_COMPONENT, FORM_COMPONENT, GUEST_CHAT_COMPONENT };

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * Validate a raw blocks value (array, or JSON string of one) into a persistable
 * `Block[]`, collecting referenced component names. PURE — never throws/writes.
 * The route checks the names exist in D1 (this can't — no binding here).
 *
 * TOP-LEVEL RULE: a page's top level holds ONLY Sections; every component must
 * live inside a Section's column. A bare non-Section component at the top level
 * is rejected — EXCEPT ids in `opts.grandfatheredTopLevelIds`, so already-saved
 * pages that predate the rule keep working (the caller passes the currently-
 * persisted top-level ids). New strays error with a fix hint.
 */
export function validateBlocks(
  raw: unknown,
  opts?: { grandfatheredTopLevelIds?: Set<string> },
): { ok: true; blocks: Block[]; componentNames: string[] } | { ok: false; errors: string[] } {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, errors: ["blocks must be a JSON array (or a JSON string of one)"] };
    }
  }
  if (!Array.isArray(value)) {
    return { ok: false, errors: ["blocks must be a JSON array of block objects"] };
  }

  const errors: string[] = [];
  const names = new Set<string>();
  const ids = new Set<string>();
  value.forEach((b, i) => walk(b, `blocks[${i}]`));

  // TOP-LEVEL RULE: only Sections may sit at the top level. A bare component
  // there is a mistake (it renders outside any section layout). Grandfather ids
  // that were already persisted so existing pages still save.
  if (errors.length === 0) {
    const grandfathered = opts?.grandfatheredTopLevelIds;
    for (const b of value as Block[]) {
      if (b.component === SECTION_COMPONENT) continue;
      if (grandfathered?.has(b.id)) continue;
      errors.push(
        `top-level block "${b.id}" is a "${b.component}", but only Sections are allowed at the top level. ` +
          `Wrap it in a Section (Section → __section_row__ → __section_column__ → ${b.component}) or add it to an existing section.`,
      );
    }
  }

  // Repair the common "component directly under a Section" mistake (the renderer
  // would silently drop it) BEFORE returning — only once the shape is valid, so
  // we never run it over malformed input. The wrapped tree is what we persist.
  if (errors.length === 0) {
    value = normalizeSectionColumns(value as Block[]);
  }

  if (errors.length === 0) {
    // Reuse the renderer's own walker (empty component map): unknown components
    // become hidden placeholders and never throw, so a throw = structurally broken.
    try {
      planPage(value as Block[], new Map());
    } catch (err) {
      errors.push(`blocks are not renderable: ${(err as Error).message}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  // The reserved built-ins (Section / column / List) are renderer primitives,
  // not D1 components — drop them so the route's component-existence check
  // (`missingComponents`) never 409s on a page that contains them.
  for (const n of [...names]) {
    if (isBuiltinComponent(n)) names.delete(n);
  }
  return { ok: true, blocks: value as Block[], componentNames: [...names] };

  function walk(block: unknown, path: string): void {
    if (typeof block !== "object" || block === null || Array.isArray(block)) {
      errors.push(`${path} must be a block object`);
      return;
    }
    const b = block as Record<string, unknown>;
    if (b.id == null || b.id === "") {
      // Absent vs malformed matters to the AI: an un-nudged model retries a
      // byte-identical payload on "must be a short identifier" — tell it the
      // field is MISSING and show the fix.
      errors.push(
        `${path}.id is missing — give the block a short unique id (letters, digits, -, _), e.g. "contact-form-child"`,
      );
    } else if (typeof b.id !== "string" || !ID_RE.test(b.id)) {
      errors.push(
        `${path}.id ${JSON.stringify(b.id).slice(0, 80)} must be a short identifier (letters, digits, -, _)`,
      );
    } else if (ids.has(b.id)) {
      errors.push(`${path}.id "${b.id}" is duplicated (block ids must be unique)`);
    } else {
      ids.add(b.id);
    }
    if (typeof b.component !== "string" || b.component.trim() === "") {
      errors.push(`${path}.component must be a non-empty component name`);
    } else {
      names.add(b.component.trim());
    }
    if (b.props != null && (typeof b.props !== "object" || Array.isArray(b.props))) {
      errors.push(`${path}.props must be an object`);
    }
    if (b.children != null) {
      if (!Array.isArray(b.children)) {
        errors.push(`${path}.children must be an array of blocks`);
      } else {
        (b.children as unknown[]).forEach((c, i) => walk(c, `${path}.children[${i}]`));
      }
    }
  }
}

/**
 * Top-level block ids of an already-persisted page, for grandfathering the
 * "top level is Sections only" rule (see `validateBlocks`). Tolerates a raw JSON
 * string or a parsed array; a non-array yields an empty set.
 */
export function topLevelBlockIds(blocks: unknown): Set<string> {
  let arr = blocks;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      return new Set();
    }
  }
  if (!Array.isArray(arr)) return new Set();
  const ids = new Set<string>();
  for (const b of arr) {
    if (b && typeof b === "object" && typeof (b as Block).id === "string") ids.add((b as Block).id);
  }
  return ids;
}

/** A field type the editor's settings form knows how to render. */
export type PropFieldType =
  | "string"
  | "richtext"
  | "number"
  | "boolean"
  | "select"
  | "date"
  | "time"
  // An asset URL (image). Stored + bound exactly like a string (a `/media/...`
  // URL), but the editor renders a gallery picker instead of a text input. Never
  // per-locale. The AI declares it for image slots; existing `string` image props
  // are also offered the picker via the `isImageProp` name heuristic.
  | "image"
  // A LINK URL (href). Stored + bound exactly like a string; the editor renders a
  // page picker + free text + an "open in new tab" toggle. The new-tab flag lives
  // in a companion boolean prop `<name>NewTab` (see linkNewTabProp); the renderer
  // expands a `{{target <name>}}` slot into target/rel attrs from it. Never
  // per-locale. Existing string href props are offered the picker via the name
  // heuristic (isLinkProp), same as images.
  | "link"
  // An icon NAME from the Site's selected icon set (icon-sets epic). Stored +
  // bound exactly like a string (the bare name, e.g. "calendar"); the component
  // references it with an `{{icon "name"}}` literal or a dynamic `{{icon prop}}`
  // slot, and the renderer inlines the SVG. The editor renders a searchable icon
  // PICKER instead of a text input. Never per-locale.
  | "icon"
  // A structured value (array/object) authored as JSON. Unlike the scalar types
  // it never binds into a `{{slot}}` as readable text — it is serialized into a
  // DOM attribute (slotString JSON-stringifies it) so a component's CLIENT script
  // can JSON.parse it back. This is how list/object data reaches an interactive
  // component (e.g. Combobox options) in a static-SSR, instance-blind-script model.
  | "json";

/** A `{value,label}` choice for a `select` field. */
export interface PropOption {
  value: string;
  label: string;
}

/** One configurable prop, parsed from a component's `propsSchema` JSON. */
export interface PropField {
  name: string;
  type: PropFieldType;
  /** Raw default as authored (string for text/select, string|number|boolean else). */
  default: string;
  /** Typed default for non-string fields (number/boolean), else undefined. */
  defaultValue?: unknown;
  required: boolean;
  /** Only meaningful for string/richtext — others are never per-locale. */
  translatable: boolean;
  /** Human label (falls back to `name` in the UI). */
  label?: string;
  description?: string;
  /** select-only: the allowed options. */
  options?: PropOption[];
  /** link-only: default for the companion `<name>NewTab` flag (see linkNewTabProp). */
  newTab?: boolean;
}

const FIELD_TYPES = new Set<PropFieldType>([
  "string",
  "richtext",
  "number",
  "boolean",
  "select",
  "date",
  "time",
  "image",
  "link",
  "icon",
  "json",
]);

/**
 * Prop-name fragments that mark a (declared-as-string) prop as holding an image
 * URL, so the editor offers the gallery picker for it without the component having
 * to declare `type:"image"`. Matched case-insensitively as a substring of the prop
 * name. Covers the common authoring vocabulary (backgroundImage, heroPhoto, …).
 */
const IMAGE_NAME_HINTS = [
  "image",
  "img",
  "photo",
  "picture",
  "avatar",
  "logo",
  "thumbnail",
  "thumb",
  "banner",
  "cover",
  "background",
];

/**
 * Should this prop be edited with the image GALLERY PICKER (vs a text input)?
 * True when it's declared `type:"image"`, OR it's a plain string/richtext prop
 * whose NAME looks image-ish (the heuristic that upgrades existing components).
 * A translatable prop is never an image (per-locale text, not an asset). PURE.
 */
export function isImageProp(field: { type: PropFieldType; name: string; translatable?: boolean }): boolean {
  if (field.translatable) return false;
  if (field.type === "image") return true;
  if (field.type !== "string" && field.type !== "richtext") return false;
  const n = field.name.toLowerCase();
  return IMAGE_NAME_HINTS.some((h) => n.includes(h));
}

/**
 * A text value long enough to deserve a textarea instead of a single-line input
 * (multi-line, or past a one-line length). Lets the editor give `string`-declared
 * body copy a textarea even when the component didn't mark it `richtext`. PURE.
 */
export function isLongText(v: unknown): boolean {
  return typeof v === "string" && (v.includes("\n") || v.length > 60);
}

/**
 * Prop-name fragments that mark a (declared-as-string) prop as holding a LINK
 * URL, so the editor offers the page picker + "open in new tab" toggle without
 * the component declaring `type:"link"`. Matched case-insensitively as a
 * substring (covers href, url, link, ...). Mirrors IMAGE_NAME_HINTS.
 */
const LINK_NAME_HINTS = ["href", "url", "link"];

/**
 * Should this prop be edited as a LINK (page picker + new-tab toggle) vs a plain
 * text input? True when declared `type:"link"`, OR a plain string prop whose NAME
 * looks link-ish. A translatable prop is never a link (per-locale text, not a URL).
 * An image prop wins over link (a name like "backgroundImageUrl" is an image). PURE.
 */
export function isLinkProp(field: {
  type: PropFieldType;
  name: string;
  translatable?: boolean;
}): boolean {
  if (field.translatable) return false;
  if (field.type === "link") return true;
  if (isImageProp(field)) return false;
  if (field.type !== "string") return false;
  const n = field.name.toLowerCase();
  return LINK_NAME_HINTS.some((h) => n.includes(h));
}

/**
 * The companion BOOLEAN prop name that carries a link prop's "open in new tab"
 * flag: `ctaHref` → `ctaHrefNewTab`. The editor writes/reads this alongside the
 * href; the renderer expands `{{target ctaHref}}` from it. PURE, one convention
 * shared by editor + renderer so they never disagree on the name.
 */
export function linkNewTabProp(hrefPropName: string): string {
  return `${hrefPropName}NewTab`;
}

/** Matches a TRANSLATABLE slot `{{t propName}}` and captures the prop name. */
const T_SLOT_RE = /\{\{\s*t\s+([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * The set of prop names a component's HTML marks TRANSLATABLE via `{{t prop}}`
 * slots. The `{{t}}` prefix is the authoring signal that a prop is per-locale; the
 * `propsSchema` SHOULD also carry `translatable:true`, but the AI often forgets —
 * so we derive it from the markup as the source of truth. PURE. "" → empty set.
 */
export function translatableSlotNames(html: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!html) return out;
  for (const m of html.matchAll(T_SLOT_RE)) out.add(m[1]);
  return out;
}

/**
 * Fold HTML-derived translatable flags into a raw `propsSchema` JSON STRING: any
 * prop whose name is in `names` (from `translatableSlotNames`) gets
 * `translatable:true`. So a component whose markup uses `{{t title}}` but whose
 * schema forgot the flag still edits per-locale. Returns a new JSON string (or the
 * original when nothing changes / on bad JSON). PURE — never throws.
 */
export function applyTranslatableFromSlots(
  propsSchema: string | null | undefined,
  names: Set<string>,
): string | null {
  if (!propsSchema || names.size === 0) return propsSchema ?? null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(propsSchema);
  } catch {
    return propsSchema;
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return propsSchema;
  const obj = parsed as Record<string, unknown>;
  let changed = false;
  for (const name of names) {
    const spec = obj[name];
    if (spec && typeof spec === "object" && !Array.isArray(spec)) {
      const s = spec as Record<string, unknown>;
      if (s.translatable !== true) {
        s.translatable = true;
        changed = true;
      }
    }
  }
  return changed ? JSON.stringify(obj) : propsSchema;
}

/** True if `raw` is valid JSON (or already a non-null array/object). PURE. */
function isJsonValue(raw: unknown): boolean {
  if (raw && typeof raw === "object") return true; // already parsed (array/object)
  if (typeof raw !== "string") return false;
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

// ISO storage formats, locale-agnostic. DISPLAY formatting is the component's job.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
const TIME_RE = /^\d{2}:\d{2}$/; // HH:mm

/** True if `v` is a valid stored date (YYYY-MM-DD) or time (HH:mm). PURE. */
function isValidDateTime(v: unknown, type: "date" | "time"): boolean {
  if (typeof v !== "string") return false;
  if (type === "date") return DATE_RE.test(v);
  // HH:mm with sane hour/minute ranges.
  if (!TIME_RE.test(v)) return false;
  const [h, m] = v.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** Normalize a raw `options` value into `{value,label}[]` (strings → value=label). */
function parseOptions(raw: unknown): PropOption[] {
  if (!Array.isArray(raw)) return [];
  const out: PropOption[] = [];
  for (const o of raw) {
    if (typeof o === "string") out.push({ value: o, label: o });
    else if (o && typeof o === "object") {
      const v = (o as Record<string, unknown>).value;
      const l = (o as Record<string, unknown>).label;
      if (typeof v === "string") out.push({ value: v, label: typeof l === "string" ? l : v });
    }
  }
  return out;
}

/**
 * Parse a component's `propsSchema` JSON into the editor's field descriptors —
 * the SAME allowlist the renderer's `declaredProps` derives, so the props UI and
 * the binder agree on which props exist.
 *
 * The schema is an object keyed by prop name; each value is a descriptor:
 *   `{ type, default, required, translatable, label, description, options }`.
 * `type` is one of string | richtext | number | boolean | select — an
 * unknown/missing type degrades to "string" (a plain text field, never throws).
 * `translatable` is only honored for string/richtext (other types are scalar).
 * PURE — never throws.
 */
export function parsePropsSchema(propsSchema: string | null | undefined): PropField[] {
  if (!propsSchema) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(propsSchema);
  } catch {
    return [];
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  return Object.entries(parsed as Record<string, unknown>).map(([name, spec]) => {
    const s = spec && typeof spec === "object" ? (spec as Record<string, unknown>) : {};
    const type = FIELD_TYPES.has(s.type as PropFieldType) ? (s.type as PropFieldType) : "string";
    const isText = type === "string" || type === "richtext";

    // Default: a string for text/select; a typed value (number/bool) carried in
    // both `default` (display) and `defaultValue` (typed) for the others.
    let def = "";
    let defaultValue: unknown;
    if (type === "number") {
      const n = typeof s.default === "number" ? s.default : Number(s.default);
      if (Number.isFinite(n)) {
        defaultValue = n;
        def = String(n);
      }
    } else if (type === "boolean") {
      defaultValue = s.default === true || s.default === "true";
      def = defaultValue ? "true" : "false";
    } else if (type === "json") {
      // Default may be authored as a JSON string OR as a real array/object;
      // normalize to a JSON STRING for `default` (the textarea edits text) and
      // keep the parsed value in `defaultValue` for the renderer/binder.
      if (typeof s.default === "string") {
        def = s.default;
        try {
          defaultValue = JSON.parse(s.default);
        } catch {
          /* leave defaultValue undefined on bad JSON */
        }
      } else if (s.default && typeof s.default === "object") {
        defaultValue = s.default;
        def = JSON.stringify(s.default);
      }
    } else if (
      isText &&
      s.translatable === true &&
      s.default &&
      typeof s.default === "object" &&
      !Array.isArray(s.default)
    ) {
      // A translatable text prop may carry a per-locale default object
      // ({ en:"…", fi:"…" }) so the component preview + any unbound page render
      // in EVERY locale. Keep the object in `defaultValue` for the renderer
      // (resolveLocalized picks the active locale); `default` holds a display
      // string for the editor textarea (first locale value).
      defaultValue = s.default;
      const first = Object.values(s.default as Record<string, unknown>).find(
        (v) => typeof v === "string",
      );
      def = typeof first === "string" ? first : "";
    } else {
      def = typeof s.default === "string" ? s.default : "";
    }

    return {
      name,
      type,
      default: def,
      defaultValue,
      required: s.required === true,
      // Only text fields can be per-locale; ignore translatable on scalars.
      translatable: isText && s.translatable === true,
      label: typeof s.label === "string" ? s.label : undefined,
      description: typeof s.description === "string" ? s.description : undefined,
      options: type === "select" ? parseOptions(s.options) : undefined,
      newTab: s.newTab === true ? true : undefined,
    };
  });
}

/**
 * Drop undeclared keys from a block's props and (when given the typed schema)
 * coerce each value to its declared type, mirroring the renderer's allowlist
 * (`declaredProps`). Two call shapes:
 *
 *  - `validateBlockProps(props, Set<name>)` — legacy: keep only declared keys,
 *    drop empty strings. No type coercion (the value is already a string or a
 *    locale object from the per-locale editor). Used by the C3 block-editor.
 *  - `validateBlockProps(props, PropField[])` — schema-aware: keep only declared
 *    keys and coerce by type — number → finite number (non-numeric dropped),
 *    boolean → bool, select → value must be one of `options` (else dropped),
 *    string/richtext kept as-is (string or locale object). A REQUIRED prop is
 *    NEVER dropped to "" — its declared default is substituted so the prop stays
 *    present; a non-required empty string is dropped (unbound slot renders "").
 *
 * PURE — never mutates inputs, never throws.
 */
export function validateBlockProps(
  props: Record<string, unknown>,
  declared: Set<string> | PropField[],
): Record<string, unknown> {
  // Legacy Set path — name allowlist only, no coercion.
  if (declared instanceof Set) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (!declared.has(k)) continue;
      if (typeof v === "string" && v === "") continue;
      out[k] = v;
    }
    return out;
  }

  // Schema-aware path — coerce each declared prop by its type.
  const out: Record<string, unknown> = {};
  // Reserved layout props aren't in the component schema but are per-block editor
  // settings the renderer reads (see wrapBlockWidth). Preserve them so a field
  // edit (which re-validates the whole props) doesn't strip the chosen layout.
  if (props.width === "auto" || props.width === "fill") out.width = props.width;
  // Per-block spacing (page-builder Spacing panel): padding/margin per side +
  // companion unit — the renderer reads them off the block wrapper
  // (wrapBlockWidth), so keep them through re-validation like `width`.
  for (const kind of ["padding", "margin"]) {
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const v = props[`${kind}${side}`];
      if (typeof v === "number" && Number.isFinite(v)) out[`${kind}${side}`] = v;
      const u = props[`${kind}${side}Unit`];
      if (u === "rem" || u === "px") out[`${kind}${side}Unit`] = u;
    }
  }
  // Companion "open in new tab" flags: for each LINK prop `X`, preserve the
  // `XNewTab` boolean (the editor's new-tab toggle). It isn't a declared schema
  // prop, but the renderer reads it to add target/rel — so keep it, like `width`.
  // An explicit FALSE is kept too: it overrides a schema-level `newTab` default
  // (schemaDefaults cascades the component's toggle; the block can turn it off).
  for (const f of declared) {
    if (isLinkProp(f)) {
      const flag = props[linkNewTabProp(f.name)];
      if (flag === true || flag === "true") out[linkNewTabProp(f.name)] = true;
      else if (flag === false || flag === "false") out[linkNewTabProp(f.name)] = false;
    }
  }
  for (const f of declared) {
    const raw = props[f.name];
    if (f.type === "number") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(n)) out[f.name] = n;
      else if (f.required && f.defaultValue !== undefined) out[f.name] = f.defaultValue;
    } else if (f.type === "boolean") {
      out[f.name] = raw === true || raw === "true";
    } else if (f.type === "select") {
      const ok = f.options?.some((o) => o.value === raw);
      if (ok) out[f.name] = raw;
      else if (f.required && f.default !== "") out[f.name] = f.default;
    } else if (f.type === "date" || f.type === "time") {
      // Keep only well-formed ISO values (YYYY-MM-DD / HH:mm); never per-locale.
      if (isValidDateTime(raw, f.type)) out[f.name] = raw;
      else if (f.required && isValidDateTime(f.default, f.type)) out[f.name] = f.default;
    } else if (f.type === "json") {
      // Keep a value only if it's valid JSON (a JSON string) or already a parsed
      // array/object; otherwise fall back to the declared default (so the slot
      // still carries well-formed JSON for the client script to parse).
      if (isJsonValue(raw)) out[f.name] = raw;
      else if (f.default !== "" && isJsonValue(f.default)) out[f.name] = f.default;
    } else {
      // string / richtext — string or a {loc:text} locale object; "" is dropped
      // unless required (then keep the declared default so it stays present).
      if (typeof raw === "string" && raw === "") {
        if (f.required && f.default !== "") out[f.name] = f.default;
      } else if (raw != null) {
        out[f.name] = raw;
      } else if (f.required && f.default !== "") {
        out[f.name] = f.default;
      }
    }
  }
  return out;
}

/**
 * The string to show in the per-locale editor field for `locale`, given a prop's
 * current stored value. A locale object (`{en,fi,…}`) yields its `locale` entry
 * (falling back to "" — NOT to another locale, so each field edits exactly its
 * own locale). A bare string is the value for the site's DEFAULT locale only
 * (legacy / single-locale authoring); other locale fields start empty. PURE.
 */
export function localeFieldValue(
  propValue: unknown,
  locale: string,
  defaultLocale: string,
): string {
  if (isLocaleObject(propValue)) {
    const v = (propValue as Record<string, unknown>)[locale];
    return typeof v === "string" ? v : "";
  }
  if (typeof propValue === "string") {
    return locale === defaultLocale ? propValue : "";
  }
  return "";
}

/**
 * Set one locale's text on a localized prop, returning the new prop value.
 *
 * - Single content locale → a bare string (no needless locale object), matching
 *   how non-localized props are stored and how the legacy single-field editor
 *   wrote them.
 * - Multiple locales → a `{ loc: text }` locale object, carrying over the other
 *   locales' current values (read from the existing prop value, whatever its
 *   shape) and dropping any locale whose text is empty. An all-empty result
 *   collapses to "" so `validateBlockProps` then drops the prop entirely.
 *
 * PURE — never mutates inputs.
 */
export function setLocalizedProp(
  current: unknown,
  locale: string,
  value: string,
  locales: string[],
): string | Record<string, string> {
  if (locales.length <= 1) return value;
  const defaultLocale = locales[0];
  const obj: Record<string, string> = {};
  for (const loc of locales) {
    const text = loc === locale ? value : localeFieldValue(current, loc, defaultLocale);
    if (text !== "") obj[loc] = text;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) return "";
  // A single non-empty locale that is the default collapses to a bare string,
  // so a freshly-typed default-only prop stays simple (and round-trips cleanly).
  if (keys.length === 1 && keys[0] === defaultLocale) return obj[defaultLocale];
  return obj;
}

/**
 * Collect the SOURCE-locale text of every translatable string/richtext prop that
 * actually has text, for the AI-translate button. Returns `{ fieldName: text }`
 * (the body the `/api/translate` endpoint wants under `fields`). Skips props with
 * empty source text (nothing to translate). PURE.
 */
export function collectTranslatableSource(
  props: Record<string, unknown> | undefined,
  schema: PropField[],
  fromLocale: string,
  defaultLocale: string,
): Record<string, string> {
  const p = props ?? {};
  const out: Record<string, string> = {};
  for (const f of schema) {
    if (!f.translatable) continue;
    if (f.type !== "string" && f.type !== "richtext") continue;
    const text = localeFieldValue(p[f.name], fromLocale, defaultLocale);
    if (text.trim() !== "") out[f.name] = text;
  }
  return out;
}

/**
 * Merge AI-translation results back into a block's props. `translations` is the
 * endpoint's `{ fieldName: { loc: text } }` map; for each field we write every
 * returned locale's text through `setLocalizedProp` (keeping the storage shape
 * consistent with manual edits), then re-validate the whole props by schema.
 * Locales not in the Site's `locales` list are ignored. PURE.
 */
export function mergeTranslations(
  props: Record<string, unknown> | undefined,
  translations: Record<string, Record<string, string>>,
  schema: PropField[],
  locales: string[],
): Record<string, unknown> {
  let next: Record<string, unknown> = { ...(props ?? {}) };
  for (const [field, localeMap] of Object.entries(translations)) {
    if (!localeMap || typeof localeMap !== "object") continue;
    for (const loc of locales) {
      const text = localeMap[loc];
      if (typeof text !== "string" || text === "") continue;
      next = { ...next, [field]: setLocalizedProp(next[field], loc, text, locales) };
    }
  }
  return validateBlockProps(next, schema);
}

/** A fresh top-level block referencing `component`, with a unique generated id. */
export function makeBlock(component: string, existing: Block[]): Block {
  return { id: uniqueBlockId(component, existing), component };
}

/** Append a new block for `component` to the top-level list (immutable). */
export function addBlock(blocks: Block[], component: string): Block[] {
  return [...blocks, makeBlock(component, blocks)];
}

/** Remove the top-level block with `id` (immutable; no-op if absent). */
export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks.filter((b) => b.id !== id);
}

/**
 * Move the top-level block at `index` by `delta` (−1 up, +1 down), clamped to
 * the list bounds (immutable). Out-of-range index or a no-op move returns the
 * same array contents.
 */
export function moveBlock(blocks: Block[], index: number, delta: number): Block[] {
  const to = index + delta;
  if (index < 0 || index >= blocks.length || to < 0 || to >= blocks.length || delta === 0) {
    return [...blocks];
  }
  const next = [...blocks];
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved);
  return next;
}

/** A block id unique within `existing`, derived from the component name. */
function uniqueBlockId(component: string, existing: Block[]): string {
  const base = component.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "block";
  const taken = new Set(existing.map((b) => b.id));
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}

// ── Section-aware editing (page-builder visual editor) ──────────────────────
//
// The visual builder composes a page as a list of SECTIONS, and into each
// Section it drops COMPONENT blocks (the aicms page-builder-v2 model). A Section
// is just a top-level `Block` whose `component` is the reserved name below, with
// its dropped components living in `children`. This reuses the existing Block
// tree (no new block pipeline) — the same shape the Layers panel will render and
// the same `validateBlocks`/`setPageBlocks` REST persists. The id collision check
// in `uniqueBlockId` is scoped per-list, so children get ids unique within their
// section; that's fine for rendering but page-wide uniqueness is enforced at
// persist time by `validateBlocks` (it rejects duplicate ids across the whole
// tree) — see `uniqueIdAcrossTree` below which keeps the editor in step.

/** True if a block is a layout Section (its children are COLUMN blocks). */
export function isSection(block: Block): boolean {
  return block.component === SECTION_COMPONENT;
}

/** True if a block is a Section ROW (holds `__section_column__` children). */
export function isSectionRow(block: Block): boolean {
  return block.component === SECTION_ROW_COMPONENT;
}

/** True if a block is a Section COLUMN (holds dropped components in children). */
export function isSectionColumn(block: Block): boolean {
  return block.component === SECTION_COLUMN_COMPONENT;
}

/**
 * A Section's display NAME (Page Builder + @section mentions). The operator-set
 * name lives in `props.name`; when unset we fall back to "Section N" using the
 * section's 1-based position among top-level Sections. `index` is that position
 * minus 1 (0-based). Kept pure so the composer, Layers, and context block agree.
 */
export function sectionName(section: Block, index: number): string {
  const raw = section.props?.name;
  const name = typeof raw === "string" ? raw.trim() : "";
  return name !== "" ? name : `Section ${index + 1}`;
}

/**
 * The top-level Sections of a page as `{ id, name }`, in document order. Drives
 * the @section autocomplete and the model-facing section list. Non-Section
 * top-level blocks (none today, but defensive) are skipped.
 */
export function listSections(blocks: Block[]): { id: string; name: string; block: Block }[] {
  const out: { id: string; name: string; block: Block }[] = [];
  let i = 0;
  for (const b of blocks) {
    if (!isSection(b)) continue;
    out.push({ id: b.id, name: sectionName(b, i), block: b });
    i++;
  }
  return out;
}

/** Rename a top-level Section (writes `props.name`). Blank clears back to the default. */
export function renameSection(blocks: Block[], id: string, name: string): Block[] {
  const trimmed = name.trim();
  return blocks.map((b) => {
    if (b.id !== id || !isSection(b)) return b;
    const props = { ...(b.props ?? {}) };
    if (trimmed === "") delete props.name;
    else props.name = trimmed;
    return { ...b, props };
  });
}

/**
 * A Section renders ONLY its `__section_column__` children — any component placed
 * DIRECTLY under a Section is silently dropped by the renderer (`planSection`). A
 * model (or a hand-written block tree) commonly emits `Section → [Hero]` instead
 * of `Section → [column → [Hero]]`, so the Hero vanishes. This pure pass repairs
 * that: for any Section whose direct children include non-column blocks, it wraps
 * all those stray children into ONE column (preserving order; existing columns
 * stay). Idempotent — a well-formed tree passes through unchanged. Recurses into
 * columns' children so nested Sections are fixed too.
 */
export function normalizeSectionColumns(blocks: Block[]): Block[] {
  const seen = allIds(blocks);
  // Wrap a column-HOLDER's stray (non-column) children into one trailing column,
  // keeping existing columns. Used for a Row, and for a grandfathered (row-less)
  // Section. A holder with no stray children is returned unchanged.
  function wrapStrayColumns(b: Block, children: Block[]): Block {
    const stray = children.filter((c) => !isSectionColumn(c));
    if (stray.length === 0) return children === b.children ? b : { ...b, children };
    const cols = children.filter(isSectionColumn);
    const id = uniqueIdAcrossSeen(SECTION_COLUMN_COMPONENT, seen);
    const wrap: Block = { id, component: SECTION_COLUMN_COMPONENT, children: stray };
    return { ...b, children: [...cols, wrap] };
  }
  function fix(list: Block[]): Block[] {
    return list.map((b) => {
      const children = b.children ? fix(b.children) : b.children;
      // A ROW holds columns: wrap any stray component placed directly under it.
      if (isSectionRow(b) && children) return wrapStrayColumns(b, children);
      if (!isSection(b) || !children) return children === b.children ? b : { ...b, children };
      // A Section with explicit ROWS: any stray non-row child (a loose column or
      // component from a hand-edit) gets wrapped into one trailing row.
      const rows = children.filter(isSectionRow);
      if (rows.length > 0) {
        const stray = children.filter((c) => !isSectionRow(c));
        if (stray.length === 0) return children === b.children ? b : { ...b, children };
        const cols = stray.filter(isSectionColumn);
        const loose = stray.filter((c) => !isSectionColumn(c));
        const rowChildren =
          loose.length > 0
            ? [
                ...cols,
                {
                  id: uniqueIdAcrossSeen(SECTION_COLUMN_COMPONENT, seen),
                  component: SECTION_COLUMN_COMPONENT,
                  children: loose,
                } as Block,
              ]
            : cols;
        const wrapRow: Block = {
          id: uniqueIdAcrossSeen(SECTION_ROW_COMPONENT, seen),
          component: SECTION_ROW_COMPONENT,
          props: { columns: rowChildren.length || 1 },
          children: rowChildren.length > 0 ? rowChildren : [
            { id: uniqueIdAcrossSeen(SECTION_COLUMN_COMPONENT, seen), component: SECTION_COLUMN_COMPONENT, children: [] },
          ],
        };
        return { ...b, children: [...rows, wrapRow] };
      }
      // Grandfathered Section (no rows): keep the legacy column-direct shape,
      // wrapping strays into a column exactly as before (renders as one row).
      return wrapStrayColumns(b, children);
    });
  }
  return fix(blocks);
}

/** Like uniqueIdAcrossTree but against a mutable seen-set (multi-call safe). */
function uniqueIdAcrossSeen(component: string, seen: Set<string>): string {
  const base = component.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "block";
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!seen.has(id)) {
      seen.add(id);
      return id;
    }
  }
}

/** All ids used anywhere in the tree (top-level + nested children). */
function allIds(blocks: Block[], into: Set<string> = new Set()): Set<string> {
  for (const b of blocks) {
    into.add(b.id);
    if (b.children) allIds(b.children, into);
  }
  return into;
}

/** A block id unique across the WHOLE tree, derived from the component name. */
function uniqueIdAcrossTree(component: string, tree: Block[]): string {
  const base = component.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "block";
  const taken = allIds(tree);
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** A fresh empty COLUMN block (used when seeding/growing a row). */
function makeColumn(tree: Block[]): Block {
  return {
    id: uniqueIdAcrossTree(SECTION_COLUMN_COMPONENT, tree),
    component: SECTION_COLUMN_COMPONENT,
    children: [],
  };
}

/** A fresh ROW block seeded with `columns` empty columns (ids unique tree-wide). */
function makeRow(tree: Block[], columns: number): Block {
  const id = uniqueIdAcrossTree(SECTION_ROW_COMPONENT, tree);
  const row: Block = { id, component: SECTION_ROW_COMPONENT, props: { columns }, children: [] };
  let acc = [...tree, row];
  const cols: Block[] = [];
  for (let i = 0; i < Math.max(1, columns); i++) {
    const col = makeColumn(acc);
    cols.push(col);
    acc = [...acc, col];
  }
  return { ...row, children: cols };
}

/**
 * Append a new Section seeded with ONE row of one column (immutable). The name is
 * left unset (the operator/AI sets props.name). Rows are the layer between Section
 * and columns; a fresh section gets one row.
 */
export function addSection(blocks: Block[]): Block[] {
  const id = uniqueIdAcrossTree(SECTION_COMPONENT, blocks);
  const withSection = [
    ...blocks,
    { id, component: SECTION_COMPONENT, props: {}, children: [] } as Block,
  ];
  const row = makeRow(withSection, 1);
  return withSection.map((b) => (b.id === id ? { ...b, children: [row] } : b));
}

/**
 * The ROWS of a Section, GRANDFATHER-AWARE. Explicit `__section_row__` children if
 * present; otherwise the Section itself is treated as ONE implicit row (its direct
 * `__section_column__` children + the section's own `columns`/`columnBehavior`
 * props). So legacy column-direct sections and new row-wrapped sections read the
 * same way — the renderer's `sectionRowBlocks` mirrors this. PURE.
 */
export function sectionRows(section: Block): Block[] {
  const rows = (section.children ?? []).filter(isSectionRow);
  if (rows.length > 0) return rows;
  return [section]; // grandfathered: the section acts as its own single row
}

/**
 * The COLUMN children of a ROW (or a grandfathered section-as-row) in order.
 * Empty for a block with no column children. PURE.
 */
export function rowColumns(row: Block): Block[] {
  return (row.children ?? []).filter(isSectionColumn);
}

/**
 * The COLUMN children of a Section — grandfather-aware, flattened across ALL rows
 * in document order. Kept for callers that still think section-flat (name lookups,
 * counts). For per-row work use `sectionRows` + `rowColumns`. PURE.
 */
export function sectionColumns(section: Block): Block[] {
  return sectionRows(section).flatMap(rowColumns);
}

/**
 * The CSS `grid-template-columns` for ONE row's columns, mirroring the public
 * render (plan-section `rowGridCols`): "collapse" shrinks empty columns to 0fr,
 * otherwise N equal 1fr tracks. Drives the Layers tree's per-row column layout.
 * Accepts a ROW block (or a grandfathered section-as-row). PURE.
 */
export function rowGridCols(row: Block): string {
  const p = (row.props ?? {}) as Record<string, unknown>;
  const cols = rowColumns(row);
  const columns = typeof p.columns === "number" ? p.columns : Number(p.columns) || cols.length || 1;
  if (p.columnBehavior === "collapse") {
    return cols.map((c) => ((c.children?.length ?? 0) > 0 ? "1fr" : "0fr")).join(" ") || "1fr";
  }
  return `repeat(${Math.max(1, columns)}, 1fr)`;
}

/**
 * Resolve which block inside a Section HOLDS the columns for a given `rowId`:
 *  - explicit rowId that matches a `__section_row__` child → that row.
 *  - rowId === the section id, OR no rowId on a grandfathered (row-less) section →
 *    the section itself (its columns are direct children).
 *  - no rowId on a row-wrapped section → its FIRST row.
 * Returns null if the id doesn't resolve. PURE — the single place column ops turn
 * a (sectionId, rowId?) coordinate into the actual column-holding block.
 */
function resolveRowHolder(section: Block, rowId?: string): Block | null {
  const rows = (section.children ?? []).filter(isSectionRow);
  if (rows.length === 0) return section; // grandfathered: section holds columns
  if (rowId == null || rowId === section.id) return rows[0] ?? null;
  return rows.find((r) => r.id === rowId) ?? null;
}

/**
 * Set a ROW's column count to `n` (clamped 1–4), immutable. `rowId` targets a
 * specific row; omitted → the section's first/implicit row (grandfather-safe).
 *
 * - Growing appends empty columns.
 * - Shrinking removes trailing columns but reflows their content into the last
 *   kept column (nothing lost).
 * - The holder's `props.columns` is updated. No-op for a non-Section id / unknown
 *   row. PURE.
 */
export function setSectionColumns(
  blocks: Block[],
  sectionId: string,
  n: number,
  rowId?: string,
): Block[] {
  const want = Math.max(1, Math.min(4, Math.floor(n)));
  return blocks.map((section) => {
    if (section.id !== sectionId || !isSection(section)) return section;
    const holder = resolveRowHolder(section, rowId);
    if (!holder) return section;
    const nextHolder = growShrinkColumns(holder, want, blocks);
    return holder === section
      ? nextHolder
      : {
          ...section,
          children: (section.children ?? []).map((c) => (c.id === holder.id ? nextHolder : c)),
        };
  });
}

/** Grow/shrink a column-holding block's columns to `want`, reflowing on shrink. PURE. */
function growShrinkColumns(holder: Block, want: number, tree: Block[]): Block {
  const cols = rowColumns(holder);
  const other = (holder.children ?? []).filter((c) => !isSectionColumn(c));
  let nextCols: Block[];
  if (want >= cols.length) {
    nextCols = [...cols];
    let acc = [...tree, ...nextCols];
    while (nextCols.length < want) {
      const col = makeColumn(acc);
      nextCols = [...nextCols, col];
      acc = [...acc, col];
    }
  } else {
    const kept = cols.slice(0, want);
    const reflow = cols.slice(want).flatMap((c) => c.children ?? []);
    const lastIdx = kept.length - 1;
    nextCols = kept.map((c, i) =>
      i === lastIdx ? { ...c, children: [...(c.children ?? []), ...reflow] } : c,
    );
  }
  return { ...holder, props: { ...holder.props, columns: want }, children: [...nextCols, ...other] };
}

/**
 * Delete a SPECIFIC column from its parent row/section, DISCARDING its components
 * (immutable). Decrements the holder's `props.columns`. GUARD: a row must keep ≥1
 * column. No-op if `columnId` isn't a Section column. PURE.
 */
export function deleteColumn(blocks: Block[], columnId: string): Block[] {
  function fix(list: Block[]): Block[] {
    return list.map((b) => {
      const holdsCol = (b.children ?? []).some((c) => c.id === columnId && isSectionColumn(c));
      if (holdsCol) {
        const cols = rowColumns(b);
        if (cols.length <= 1) return b; // keep ≥1 column
        const nextChildren = (b.children ?? []).filter((c) => c.id !== columnId);
        const remaining = nextChildren.filter(isSectionColumn).length;
        return { ...b, props: { ...b.props, columns: remaining }, children: nextChildren };
      }
      return b.children ? { ...b, children: fix(b.children) } : b;
    });
  }
  return fix(blocks);
}

/**
 * Append a component into a column at `colIndex` (0-based) within a Section's row,
 * immutable. `rowId` targets a specific row; omitted → the first/implicit row.
 * No-op if the section/row/column doesn't resolve. Id unique tree-wide. PURE.
 */
export function addComponentToColumn(
  blocks: Block[],
  sectionId: string,
  colIndex: number,
  component: string,
  rowId?: string,
): Block[] {
  const child: Block = { id: uniqueIdAcrossTree(component, blocks), component };
  return blocks.map((section) => {
    if (section.id !== sectionId || !isSection(section)) return section;
    const holder = resolveRowHolder(section, rowId);
    if (!holder) return section;
    const cols = rowColumns(holder);
    if (colIndex < 0 || colIndex >= cols.length) return section;
    const targetId = cols[colIndex].id;
    const nextHolder: Block = {
      ...holder,
      children: (holder.children ?? []).map((c) =>
        c.id === targetId ? { ...c, children: [...(c.children ?? []), child] } : c,
      ),
    };
    return holder === section
      ? nextHolder
      : {
          ...section,
          children: (section.children ?? []).map((c) => (c.id === holder.id ? nextHolder : c)),
        };
  });
}

/**
 * Append a component into a Section's FIRST column (immutable). Compatibility
 * shim for the existing click-insert flow now that components live in columns;
 * DnD slice 2 adds the real per-column drop. No-op for a non-Section id.
 */
export function addComponentToSection(
  blocks: Block[],
  sectionId: string,
  component: string,
): Block[] {
  return addComponentToColumn(blocks, sectionId, 0, component);
}

// ── Row operations (multi-row sections) ─────────────────────────────────────

/**
 * Ensure a Section has EXPLICIT `__section_row__` children, migrating a
 * grandfathered (column-direct) section into ONE row that holds its existing
 * columns (immutable). Idempotent — a section that already has rows is returned
 * unchanged. Called before adding a second row so the first row becomes explicit.
 * PURE.
 */
export function ensureSectionRows(section: Block, tree: Block[]): Block {
  if (!isSection(section)) return section;
  const rows = (section.children ?? []).filter(isSectionRow);
  if (rows.length > 0) return section;
  const cols = (section.children ?? []).filter(isSectionColumn);
  const other = (section.children ?? []).filter((c) => !isSectionColumn(c) && !isSectionRow(c));
  // Carry the section's legacy column props onto the new row (that's where they
  // belong now); leave the section's own props as layout-only.
  const p = (section.props ?? {}) as Record<string, unknown>;
  const rowProps: Record<string, unknown> = { columns: cols.length || 1 };
  if (p.columnBehavior != null) rowProps.columnBehavior = p.columnBehavior;
  if (p.gap != null) rowProps.gap = p.gap;
  const row: Block = {
    id: uniqueIdAcrossTree(SECTION_ROW_COMPONENT, tree),
    component: SECTION_ROW_COMPONENT,
    props: rowProps,
    children: cols.length > 0 ? cols : [makeColumn(tree)],
  };
  const sectionProps = { ...p };
  delete sectionProps.columns;
  delete sectionProps.columnBehavior;
  return { ...section, props: sectionProps, children: [row, ...other] };
}

/**
 * Append a new ROW (with `columns` columns, default 1) to a Section, immutable.
 * Migrates a grandfathered section to explicit rows first so the existing content
 * becomes row 1. No-op for a non-Section id. PURE.
 */
export function addRow(blocks: Block[], sectionId: string, columns = 1): Block[] {
  return blocks.map((section) => {
    if (section.id !== sectionId || !isSection(section)) return section;
    const migrated = ensureSectionRows(section, blocks);
    const row = makeRow([...blocks, ...(migrated.children ?? [])], columns);
    return { ...migrated, children: [...(migrated.children ?? []), row] };
  });
}

/**
 * Delete a ROW (and its columns/components) from its Section, immutable. GUARD: a
 * Section must keep ≥1 row — deleting the last row is a no-op (delete the whole
 * section instead). No-op if `rowId` isn't a row. PURE.
 */
export function deleteRow(blocks: Block[], rowId: string): Block[] {
  return blocks.map((section) => {
    if (!isSection(section)) {
      return section.children ? { ...section, children: deleteRow(section.children, rowId) } : section;
    }
    const rows = (section.children ?? []).filter(isSectionRow);
    if (!rows.some((r) => r.id === rowId)) return section;
    if (rows.length <= 1) return section; // keep ≥1 row
    return { ...section, children: (section.children ?? []).filter((c) => c.id !== rowId) };
  });
}

/** True if a block is the built-in `List` block (Phase-2 binding). */
export function isList(block: Block): boolean {
  return block.component === LIST_COMPONENT;
}

/**
 * Append a built-in `List` block into a Section's column (immutable). A List is
 * placed like a component (it lives in a column), but it carries a per-row
 * TEMPLATE child + an empty-state child instead of `props`. We seed it with one
 * empty template column-less child slot left to the operator to fill: a single
 * placeholder Section? No — the template is ONE component the operator drops in,
 * so we seed with NO children and let the List settings panel + DnD add the
 * template/empty children. The query (`listSource`) starts unset → graceful blank.
 * No-op for a non-Section id / out-of-range column. PURE.
 */
export function addListBlock(
  blocks: Block[],
  sectionId: string,
  colIndex: number,
  rowId?: string,
): Block[] {
  const list: Block = {
    id: uniqueIdAcrossTree(LIST_COMPONENT, blocks),
    component: LIST_COMPONENT,
    children: [],
  };
  return blocks.map((section) => {
    if (section.id !== sectionId || !isSection(section)) return section;
    const holder = resolveRowHolder(section, rowId);
    if (!holder) return section;
    const cols = rowColumns(holder);
    if (colIndex < 0 || colIndex >= cols.length) return section;
    const targetId = cols[colIndex].id;
    const nextHolder: Block = {
      ...holder,
      children: (holder.children ?? []).map((c) =>
        c.id === targetId ? { ...c, children: [...(c.children ?? []), list] } : c,
      ),
    };
    return holder === section
      ? nextHolder
      : {
          ...section,
          children: (section.children ?? []).map((c) => (c.id === holder.id ? nextHolder : c)),
        };
  });
}

/** Append a List into a Section's FIRST column (click-insert shim, like addComponentToSection). */
export function addListToSection(blocks: Block[], sectionId: string): Block[] {
  return addListBlock(blocks, sectionId, 0);
}

/** True if a block is the built-in `Form` block (external-data-sources Form slice). */
export function isForm(block: Block): boolean {
  return block.component === FORM_COMPONENT;
}

/**
 * Append a built-in `Form` block into a Section's column (immutable) — the Form
 * mirror of `addListBlock`. Seeded with NO children (the operator/AI adds the
 * input component) and no `formTarget` (set separately via `setBlockField`) —
 * an untargeted Form renders as a plain container, graceful by design.
 * No-op for a non-Section id / out-of-range column. PURE.
 */
export function addFormBlock(
  blocks: Block[],
  sectionId: string,
  colIndex: number,
  rowId?: string,
): Block[] {
  const form: Block = {
    id: uniqueIdAcrossTree(FORM_COMPONENT, blocks),
    component: FORM_COMPONENT,
    children: [],
  };
  return blocks.map((section) => {
    if (section.id !== sectionId || !isSection(section)) return section;
    const holder = resolveRowHolder(section, rowId);
    if (!holder) return section;
    const cols = rowColumns(holder);
    if (colIndex < 0 || colIndex >= cols.length) return section;
    const targetId = cols[colIndex].id;
    const nextHolder: Block = {
      ...holder,
      children: (holder.children ?? []).map((c) =>
        c.id === targetId ? { ...c, children: [...(c.children ?? []), form] } : c,
      ),
    };
    return holder === section
      ? nextHolder
      : {
          ...section,
          children: (section.children ?? []).map((c) => (c.id === holder.id ? nextHolder : c)),
        };
  });
}

/** Append a Form into a Section's FIRST column (click-insert shim, like addListToSection). */
export function addFormToSection(blocks: Block[], sectionId: string): Block[] {
  return addFormBlock(blocks, sectionId, 0);
}

/** True if a block is the built-in `GuestChat` block (public guest-chatbots epic). */
export function isGuestChat(block: Block): boolean {
  return block.component === GUEST_CHAT_COMPONENT;
}

/**
 * Append a built-in `GuestChat` block into a Section's column (immutable). Unlike
 * List/Form, a GuestChat is a LEAF (no `children` slot) — it drops exactly like a
 * component, so this mirrors `addComponentToColumn` but seeds the reserved
 * `component` name + the default `props.mode = "inline"` (the operator picks the
 * agent + the rest in the settings panel; empty title/placeholder/welcome fall
 * back to the renderer defaults / the agent's welcome). No-op for a non-Section
 * id / out-of-range column. Id unique tree-wide. PURE.
 */
export function addGuestChatBlock(
  blocks: Block[],
  sectionId: string,
  colIndex: number,
  rowId?: string,
): Block[] {
  const chat: Block = {
    id: uniqueIdAcrossTree(GUEST_CHAT_COMPONENT, blocks),
    component: GUEST_CHAT_COMPONENT,
    props: { mode: "inline" },
  };
  return blocks.map((section) => {
    if (section.id !== sectionId || !isSection(section)) return section;
    const holder = resolveRowHolder(section, rowId);
    if (!holder) return section;
    const cols = rowColumns(holder);
    if (colIndex < 0 || colIndex >= cols.length) return section;
    const targetId = cols[colIndex].id;
    const nextHolder: Block = {
      ...holder,
      children: (holder.children ?? []).map((c) =>
        c.id === targetId ? { ...c, children: [...(c.children ?? []), chat] } : c,
      ),
    };
    return holder === section
      ? nextHolder
      : {
          ...section,
          children: (section.children ?? []).map((c) => (c.id === holder.id ? nextHolder : c)),
        };
  });
}

/**
 * Replace the `children` of the block `id` wherever it sits in the tree
 * (immutable). Empty array drops the key. Used to set a List's per-row TEMPLATE
 * child (+ optional empty-state child). No-op if `id` is absent. PURE.
 */
export function setBlockChildren(blocks: Block[], id: string, children: Block[]): Block[] {
  return blocks.map((b) => {
    if (b.id === id) {
      const next: Block = { ...b };
      if (children.length > 0) next.children = children;
      else delete next.children;
      return next;
    }
    return b.children ? { ...b, children: setBlockChildren(b.children, id, children) } : b;
  });
}

/**
 * Merge a patch of NON-prop block fields (`bindings`, `listSource`, `listMap`,
 * `listRole`, `formTarget`) into the block `id` wherever it sits in the tree
 * (immutable). A patch value of `undefined` deletes that key (revert to
 * unbound / no query / untargeted form). Used by the Slice-C binding panels —
 * `props` go through `mergeBlockProps`; binding/list/form config live OUTSIDE
 * props (renderer reads them separately). No-op if `id` is absent. PURE —
 * never mutates inputs.
 */
export function setBlockField(
  blocks: Block[],
  id: string,
  patch: Partial<Pick<Block, "bindings" | "listSource" | "listMap" | "listRole" | "formTarget">>,
): Block[] {
  return blocks.map((b) => {
    if (b.id === id) {
      const next: Block = { ...b };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (next as Record<string, unknown>)[k];
        else (next as Record<string, unknown>)[k] = v;
      }
      return next;
    }
    return b.children ? { ...b, children: setBlockField(b.children, id, patch) } : b;
  });
}

/**
 * Merge a settings patch into a Section's `props` (immutable). The `columns` key
 * is routed through `setSectionColumns` so the column children grow/shrink (and
 * reflow) to match — never just stamped on `props`. All other keys (alignment,
 * padding + per-side unit, gap, maxWidth, backgroundColor, columnBehavior) merge
 * straight into `props`; a value of `undefined` deletes that key (revert to the
 * renderer default). No-op for a non-Section id. PURE — never mutates inputs.
 */
export function mergeSectionProps(
  blocks: Block[],
  sectionId: string,
  patch: Record<string, unknown>,
): Block[] {
  let next = blocks;
  if ("columns" in patch) {
    const n = patch.columns;
    if (typeof n === "number") next = setSectionColumns(next, sectionId, n);
  }
  const rest = Object.fromEntries(Object.entries(patch).filter(([k]) => k !== "columns"));
  if (Object.keys(rest).length === 0) return next;
  return next.map((section) => {
    if (section.id !== sectionId || !isSection(section)) return section;
    const props: Record<string, unknown> = { ...(section.props ?? {}) };
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) delete props[k];
      else props[k] = v;
    }
    return { ...section, props };
  });
}

/**
 * Move the block `dragId` to a new position relative to `targetId`, immutable.
 *
 * `position`:
 *  - `"before"` / `"after"` — drop as a SIBLING of the target, just before/after
 *    it in the target's parent list (reorder Sections, reorder/cross-column move
 *    of components, even across Sections — wherever the target lives).
 *  - `"into"` — drop as the LAST child of the target (e.g. drop a component into
 *    an empty column). The target must accept children (a Section or a column);
 *    a leaf component target falls back to a no-op.
 *
 * No-op (returns a structurally-equal clone) when: dragId === targetId, either id
 * is missing, or the target is a descendant of the dragged node (can't move a node
 * inside itself). PURE — never mutates inputs; ids are preserved (no reassignment).
 *
 * This unifies the editor's reorder + cross-container drops onto one helper; the
 * DnD UI computes before/after/into from drop-zone thirds and calls this.
 */
export function moveNode(
  blocks: Block[],
  dragId: string,
  targetId: string,
  position: "before" | "after" | "into",
): Block[] {
  if (dragId === targetId) return clone(blocks);
  const dragged = findNode(blocks, dragId);
  const target = findNode(blocks, targetId);
  if (!dragged || !target) return clone(blocks);
  // Can't drop a node into/next to its own descendant.
  if (findNode(dragged.children ?? [], targetId)) return clone(blocks);

  // A Section is a TOP-LEVEL block; it may only be reordered among the root
  // sections, never nested into a column or beside a component inside one.
  // Without this, dragging a section over another section's BODY (a column drop
  // zone) nests it into that column — it vanishes from the layers order and
  // renders at the bottom. So a section-drag is only valid as a before/after of
  // another root section.
  if (isSection(dragged)) {
    const targetIsRootSection =
      isSection(target) && blocks.some((b) => b.id === targetId);
    if (position === "into" || !targetIsRootSection) return clone(blocks);
  }

  // A ROW belongs to ONE Section; it may only be reordered before/after a SIBLING
  // row in that SAME section — never nested into a column, moved to another
  // section, or dropped `into` anything. Guards the multi-row reorder.
  if (isSectionRow(dragged)) {
    if (position === "into" || !isSectionRow(target)) return clone(blocks);
    if (parentIdOf(blocks, dragId) !== parentIdOf(blocks, targetId)) return clone(blocks);
  }

  const without = removeNode(blocks, dragId);

  if (position === "into") {
    // Only containers (Sections / columns) accept dropped children. A row holds
    // columns, not components, so it is NOT a valid `into` target for a component.
    if (!isSection(target) && !isSectionColumn(target)) return clone(blocks);
    return insertInto(without, targetId, dragged);
  }
  return insertSibling(without, targetId, dragged, position);
}

/** The id of the block that directly contains `id`, or null if `id` is top-level. */
function parentIdOf(blocks: Block[], id: string, parent: string | null = null): string | null {
  for (const b of blocks) {
    if (b.id === id) return parent;
    const found = b.children ? parentIdOf(b.children, id, b.id) : null;
    if (found !== null) return found;
  }
  return null;
}

/**
 * Find a block by id anywhere in the tree (depth-first) — the editor's selected
 * node may be a nested component inside a Section column, not just a top-level
 * block, so the Block tab MUST tree-walk (a top-level `blocks.find` misses it).
 * Returns null if absent. PURE.
 */
export function findBlock(blocks: Block[], id: string): Block | null {
  return findNode(blocks, id);
}

/**
 * Merge a PATCH over an existing props object for a targeted single-prop edit
 * (the `set_block_props` tool). Keys in `patch` overwrite `current`; an EMPTY
 * STRING value CLEARS that key (matches the editor's "blank field → drop prop").
 * `current`'s other keys are preserved. PURE — returns a new object.
 */
export function patchBlockProps(
  current: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(current ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === "") delete out[k];
    else out[k] = v;
  }
  return out;
}

/**
 * Replace the `props` of the block `id` wherever it sits in the tree (immutable).
 * An empty `props` ({}) drops the key entirely (matches how the C3 editor stores
 * an unbound block). No-op if `id` is absent. PURE — never mutates inputs.
 */
export function mergeBlockProps(
  blocks: Block[],
  id: string,
  props: Record<string, unknown>,
): Block[] {
  return blocks.map((b) => {
    if (b.id === id) {
      const next: Block = { ...b };
      if (Object.keys(props).length > 0) next.props = props;
      else delete next.props;
      return next;
    }
    return b.children ? { ...b, children: mergeBlockProps(b.children, id, props) } : b;
  });
}

/** Find a node by id anywhere in the tree (depth-first). */
function findNode(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    const inChild = b.children ? findNode(b.children, id) : null;
    if (inChild) return inChild;
  }
  return null;
}

/**
 * Remove the node `id` wherever it sits in the tree (immutable). Removing a
 * Section drops its columns + their components too (the whole subtree goes with
 * it); removing a component leaf drops just that block. No-op if `id` is absent.
 * PURE — never mutates inputs. Backs the Layers-tree delete affordance.
 */
export function removeNode(blocks: Block[], id: string): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.id === id) continue;
    out.push(b.children ? { ...b, children: removeNode(b.children, id) } : b);
  }
  return out;
}

/** Insert `node` as the last child of the container `targetId` (immutable). */
function insertInto(blocks: Block[], targetId: string, node: Block): Block[] {
  return blocks.map((b) => {
    if (b.id === targetId) return { ...b, children: [...(b.children ?? []), node] };
    return b.children ? { ...b, children: insertInto(b.children, targetId, node) } : b;
  });
}

/** Insert `node` just before/after the sibling `targetId` (immutable). */
function insertSibling(
  blocks: Block[],
  targetId: string,
  node: Block,
  position: "before" | "after",
): Block[] {
  const idx = blocks.findIndex((b) => b.id === targetId);
  if (idx >= 0) {
    const at = position === "before" ? idx : idx + 1;
    const next = [...blocks];
    next.splice(at, 0, node);
    return next;
  }
  return blocks.map((b) =>
    b.children ? { ...b, children: insertSibling(b.children, targetId, node, position) } : b,
  );
}

/** Structural clone of a block tree (so a no-op move returns a fresh array). */
function clone(blocks: Block[]): Block[] {
  return blocks.map((b) => (b.children ? { ...b, children: clone(b.children) } : { ...b }));
}

/**
 * The Section to insert into when the operator clicks a rail component: the
 * explicitly-selected one if it's a Section, else the LAST section on the page,
 * else null (caller should add a Section first). PURE.
 */
export function targetSectionId(blocks: Block[], selectedId: string | null): string | null {
  if (selectedId) {
    const sel = blocks.find((b) => b.id === selectedId);
    if (sel && isSection(sel)) return sel.id;
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (isSection(blocks[i])) return blocks[i].id;
  }
  return null;
}
