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
  SECTION_COLUMN_COMPONENT,
  type Block,
} from "../render/tree.ts";
import { isLocaleObject } from "../render/localize.ts";

// Re-export so the editor/UI keeps importing the reserved names from here (the
// renderer in tree.ts owns the single definitions, so both layers agree).
export { SECTION_COMPONENT, SECTION_COLUMN_COMPONENT };

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * Validate a raw blocks value (array, or JSON string of one) into a persistable
 * `Block[]`, collecting referenced component names. PURE — never throws/writes.
 * The route checks the names exist in D1 (this can't — no binding here).
 */
export function validateBlocks(
  raw: unknown,
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
  // The reserved Section + column names are renderer primitives, not D1
  // components — drop them so the route's component-existence check
  // (`missingComponents`) never 409s on a page that contains Sections/columns.
  names.delete(SECTION_COMPONENT);
  names.delete(SECTION_COLUMN_COMPONENT);
  return { ok: true, blocks: value as Block[], componentNames: [...names] };

  function walk(block: unknown, path: string): void {
    if (typeof block !== "object" || block === null || Array.isArray(block)) {
      errors.push(`${path} must be a block object`);
      return;
    }
    const b = block as Record<string, unknown>;
    if (typeof b.id !== "string" || !ID_RE.test(b.id)) {
      errors.push(`${path}.id must be a short identifier (letters, digits, -, _)`);
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

/** A field type the editor's settings form knows how to render. */
export type PropFieldType = "string" | "richtext" | "number" | "boolean" | "select";

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
}

const FIELD_TYPES = new Set<PropFieldType>(["string", "richtext", "number", "boolean", "select"]);

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

/** True if a block is a Section COLUMN (holds dropped components in children). */
export function isSectionColumn(block: Block): boolean {
  return block.component === SECTION_COLUMN_COMPONENT;
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

/** A fresh empty COLUMN block (used when seeding/growing a Section). */
function makeColumn(tree: Block[]): Block {
  return {
    id: uniqueIdAcrossTree(SECTION_COLUMN_COMPONENT, tree),
    component: SECTION_COLUMN_COMPONENT,
    children: [],
  };
}

/**
 * Append a new Section seeded with one COLUMN child (immutable). The Section's
 * `props.columns` records the column count so the renderer/settings agree; the
 * actual columns are realized as `__section_column__` children.
 */
export function addSection(blocks: Block[]): Block[] {
  const id = uniqueIdAcrossTree(SECTION_COMPONENT, blocks);
  // Seed with one column. Build the tree incrementally so the column id is
  // unique against the just-added Section id too.
  const withSection = [
    ...blocks,
    { id, component: SECTION_COMPONENT, props: { columns: 1 }, children: [] } as Block,
  ];
  const column = makeColumn(withSection);
  return withSection.map((b) =>
    b.id === id ? { ...b, children: [column] } : b,
  );
}

/**
 * The COLUMN children of a Section (in order). Empty array for a non-Section or
 * a Section that somehow has no column children (legacy / hand-edited).
 */
export function sectionColumns(section: Block): Block[] {
  return (section.children ?? []).filter(isSectionColumn);
}

/**
 * The CSS `grid-template-columns` value for a Section's columns, mirroring the
 * public render (tree.ts planSection): "collapse" behavior shrinks empty columns
 * to 0fr, otherwise N equal 1fr tracks. Used by the Layers tree so it lays
 * columns out as a ROW exactly like the rendered page (not stacked).
 */
export function sectionGridCols(section: Block): string {
  const p = (section.props ?? {}) as Record<string, unknown>;
  const cols = sectionColumns(section);
  const columns = typeof p.columns === "number" ? p.columns : Number(p.columns) || cols.length || 1;
  if (p.columnBehavior === "collapse") {
    return cols.map((c) => ((c.children?.length ?? 0) > 0 ? "1fr" : "0fr")).join(" ") || "1fr";
  }
  return `repeat(${Math.max(1, columns)}, 1fr)`;
}

/**
 * Set a Section's column count to `n` (clamped 1–4), immutable.
 *
 * - Growing adds empty columns at the end.
 * - Shrinking removes trailing columns but PRESERVES their content: every
 *   component from a removed column reflows into the LAST kept column (matches
 *   aicms — nothing is silently lost). Non-column children (shouldn't occur) are
 *   carried as-is on the section.
 * - `props.columns` is updated to match. No-op (returns the tree) for a
 *   non-Section id.
 */
export function setSectionColumns(blocks: Block[], sectionId: string, n: number): Block[] {
  const want = Math.max(1, Math.min(4, Math.floor(n)));
  return blocks.map((section) => {
    if (section.id !== sectionId || !isSection(section)) return section;
    const cols = sectionColumns(section);
    const other = (section.children ?? []).filter((c) => !isSectionColumn(c));

    let nextCols: Block[];
    if (want >= cols.length) {
      // Grow: keep existing columns, append empty ones (ids unique tree-wide).
      nextCols = [...cols];
      let tree = blocks;
      while (nextCols.length < want) {
        const col = makeColumn([...tree, ...nextCols]);
        nextCols = [...nextCols, col];
      }
    } else {
      // Shrink: keep the first `want`, reflow removed columns' content into the
      // last kept column.
      const kept = cols.slice(0, want);
      const removed = cols.slice(want);
      const reflow = removed.flatMap((c) => c.children ?? []);
      const lastIdx = kept.length - 1;
      nextCols = kept.map((c, i) =>
        i === lastIdx ? { ...c, children: [...(c.children ?? []), ...reflow] } : c,
      );
    }
    return { ...section, props: { ...section.props, columns: want }, children: [...nextCols, ...other] };
  });
}

/**
 * Delete a SPECIFIC column from its parent Section, DISCARDING its components
 * (immutable). Distinct from `setSectionColumns` shrink, which reflows a removed
 * column's content into the last kept column — this drops the column's children
 * entirely (e.g. keep column 2, throw away column 1).
 *
 * Removes that `__section_column__` node AND decrements the parent Section's
 * `props.columns` so the grid recomputes (out-of-sync columns would mis-render).
 * GUARD: a Section must keep ≥1 column — deleting the only column is a no-op.
 * No-op if `columnId` isn't a Section column. PURE — never mutates inputs.
 */
export function deleteColumn(blocks: Block[], columnId: string): Block[] {
  return blocks.map((section) => {
    if (!isSection(section)) {
      return section.children
        ? { ...section, children: deleteColumn(section.children, columnId) }
        : section;
    }
    const cols = sectionColumns(section);
    const target = cols.find((c) => c.id === columnId);
    if (!target) return section;
    if (cols.length <= 1) return section; // keep ≥1 column
    const nextChildren = (section.children ?? []).filter((c) => c.id !== columnId);
    const remaining = nextChildren.filter(isSectionColumn).length;
    return { ...section, props: { ...section.props, columns: remaining }, children: nextChildren };
  });
}

/**
 * Append a component block into a Section's column at `colIndex` (0-based),
 * immutable. No-op if `sectionId` isn't a Section or `colIndex` is out of range.
 * The new child gets an id unique across the whole tree.
 */
export function addComponentToColumn(
  blocks: Block[],
  sectionId: string,
  colIndex: number,
  component: string,
): Block[] {
  const child: Block = { id: uniqueIdAcrossTree(component, blocks), component };
  return blocks.map((section) => {
    if (section.id !== sectionId || !isSection(section)) return section;
    const cols = sectionColumns(section);
    if (colIndex < 0 || colIndex >= cols.length) return section;
    const targetId = cols[colIndex].id;
    return {
      ...section,
      children: (section.children ?? []).map((c) =>
        c.id === targetId ? { ...c, children: [...(c.children ?? []), child] } : c,
      ),
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

  const without = removeNode(blocks, dragId);

  if (position === "into") {
    // Only containers (Sections / columns) accept dropped children.
    if (!isSection(target) && !isSectionColumn(target)) return clone(blocks);
    return insertInto(without, targetId, dragged);
  }
  return insertSibling(without, targetId, dragged, position);
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
