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

/**
 * Parse a component's `propsSchema` JSON into the editor's field descriptors —
 * the SAME allowlist the renderer's `declaredProps` derives, so the props UI and
 * the binder agree on which props exist. Each entry is `{ name, type, default }`;
 * `type` is normalized to `"richtext"` (→ textarea) or `"string"` (→ input) so an
 * unknown/missing type degrades to a plain text field. PURE — never throws.
 */
export function parsePropsSchema(
  propsSchema: string | null | undefined,
): { name: string; type: "string" | "richtext"; default: string }[] {
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
    const type = s.type === "richtext" ? "richtext" : "string";
    const def = typeof s.default === "string" ? s.default : "";
    return { name, type, default: def };
  });
}

/**
 * Drop undeclared keys from a block's props, mirroring the renderer's allowlist
 * (`declaredProps`): only props named in `declared` survive. Empty-string values
 * are dropped too (no point persisting blanks — an unbound slot renders ""). PURE.
 */
export function validateBlockProps(
  props: Record<string, unknown>,
  declared: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!declared.has(k)) continue;
    if (typeof v === "string" && v === "") continue;
    out[k] = v;
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
