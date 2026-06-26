/**
 * content-collections — Phase 2, Slice A: PURE component↔collection binding.
 *
 * SINGLE-ITEM binding only (List is Slice B). A page block can carry a
 * `bindings` map (SEPARATE from `props`, see `render/tree.ts:BindingRef`). Each
 * entry names a collection (its `content_<slug>` table), a structured query, and
 * a `map` of `blockPropName → collectionFieldName`. The renderer host:
 *   1. VALIDATES the binding against the registry + the target component's
 *      declared props (`validateBinding`) — reject unknown collection/field/prop.
 *   2. Picks the FIRST matching row via the Slice-4 structured query (run in the
 *      async `buildPlanFromPage`, NOT here — this module is pure, no I/O).
 *   3. HYDRATES the resolved field values into the block's `props` (under the
 *      mapped prop names) BEFORE the pure walk (`hydrateProps`).
 *
 * GRACEFUL everywhere (USER DECISION): an unknown collection/field/prop, a query
 * with no match, or a dead collection → the prop is simply left unbound (blank),
 * NEVER a throw. So validation returns reasons (for the authoring UI / AI tools)
 * but the runtime hydration just skips anything it can't resolve.
 *
 * PURE — no React, no D1, no Cloudflare. Node-testable (`node --test`), mirroring
 * the Slice 2-4 pure modules. Imports use the explicit `.ts` extension (CAVEAT).
 */
import type { CollectionField } from "./collection-schema.ts";
import { SYSTEM_COLUMNS } from "./collection-schema.ts";
import type { BindingRef, ListSource } from "../render/tree.ts";

/** The structured-query spec a single-item binding compiles to (first match). */
export interface BindingQuerySpec {
  filters: Array<{ field: string; op: string; value?: unknown }>;
  sort: Array<{ field: string; dir?: "asc" | "desc" }>;
  /** First match only — single-item binding picks the first row. */
  limit: 1;
}

/** A column name that exists on a content table: a user field or a system column. */
function columnNames(fields: CollectionField[]): Set<string> {
  const set = new Set<string>(SYSTEM_COLUMNS);
  for (const f of fields) set.add(f.name);
  return set;
}

/** "available fields: a, b, …" — appended to unknown-field errors so the model
 * can self-correct without another round-trip (AI error philosophy). */
function availableFields(fields: CollectionField[]): string {
  return ` (available fields: ${[...columnNames(fields)].join(", ")})`;
}

/**
 * Parse a component's `propsSchema` JSON into the set of DECLARED prop names —
 * the binding allowlist (same allowlist the `{{slot}}` binding uses). Bad/empty
 * JSON → empty set (graceful). Mirrors `tree.ts:declaredProps` but exported here
 * so the binding validator can reuse it without reaching into the renderer.
 */
export function declaredPropNames(propsSchema: string | null | undefined): Set<string> {
  if (!propsSchema) return new Set();
  try {
    const parsed = JSON.parse(propsSchema);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(Object.keys(parsed as Record<string, unknown>));
  } catch {
    return new Set();
  }
}

/**
 * Validate a single-item binding against the collection's registry fields and the
 * target component's declared props. Returns `ok:true` when the collection exists,
 * EVERY mapped field exists on it (user field or system column), EVERY filter/sort
 * field exists, and EVERY mapped prop is declared on the component. Otherwise
 * `ok:false` with a list of human-readable reasons (for the authoring UI / AI).
 *
 * `fields` is the registry schema for the bound collection (`CollectionView.fields`),
 * or `null` when the collection doesn't exist. `declared` is the set of declared
 * prop names on the target component (use `declaredPropNames`).
 */
export function validateBinding(
  binding: BindingRef,
  fields: CollectionField[] | null,
  declared: Set<string>,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!binding || typeof binding !== "object" || !binding.source || !binding.map) {
    return { ok: false, errors: ["binding must have a source and a map"] };
  }
  if (fields == null) {
    return { ok: false, errors: [`unknown collection "${binding.source.collection}"`] };
  }

  const cols = columnNames(fields);
  const avail = availableFields(fields);

  for (const [propName, fieldName] of Object.entries(binding.map)) {
    if (!cols.has(fieldName)) {
      errors.push(`unknown field "${fieldName}" on "${binding.source.collection}"${avail}`);
    }
    if (!declared.has(propName)) {
      errors.push(`prop "${propName}" is not declared on the target component`);
    }
  }
  for (const f of binding.source.filter ?? []) {
    if (!cols.has(f.field)) errors.push(`unknown filter field "${f.field}"${avail}`);
  }
  for (const s of binding.source.sort ?? []) {
    if (!cols.has(s.field)) errors.push(`unknown sort field "${s.field}"${avail}`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Validate a List block's query (`listSource`) + row-field→template-prop map
 * (`listMap`) against the bound collection's registry fields and the per-row
 * TEMPLATE component's declared props. Returns `ok:true` when the collection
 * exists, every filter/sort field exists, every mapped field exists (user field
 * or system column), and every mapped TEMPLATE prop is declared. Otherwise
 * `ok:false` with reasons (for the authoring UI / AI tools). Same graceful-at-
 * runtime contract as `validateBinding`: this is for AUTHORING feedback only —
 * the renderer (`planList`) skips anything it can't resolve, never throws.
 *
 * `fields` is the registry schema for the bound collection (or `null` if the
 * collection doesn't exist). `declared` is the template component's declared
 * prop names (use `declaredPropNames`); pass an empty set for a List with no
 * template yet (any non-empty `listMap` then reports undeclared props).
 */
export function validateListBinding(
  listSource: ListSource | undefined,
  listMap: Record<string, string> | undefined,
  fields: CollectionField[] | null,
  declared: Set<string>,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!listSource || typeof listSource !== "object" || !listSource.collection) {
    return { ok: false, errors: ["list must have a source collection"] };
  }
  if (fields == null) {
    return { ok: false, errors: [`unknown collection "${listSource.collection}"`] };
  }

  const cols = columnNames(fields);
  const avail = availableFields(fields);

  for (const f of listSource.filter ?? []) {
    if (!cols.has(f.field)) errors.push(`unknown filter field "${f.field}"${avail}`);
  }
  for (const s of listSource.sort ?? []) {
    if (!cols.has(s.field)) errors.push(`unknown sort field "${s.field}"${avail}`);
  }
  for (const [propName, fieldName] of Object.entries(listMap ?? {})) {
    if (!cols.has(fieldName)) {
      errors.push(`unknown field "${fieldName}" on "${listSource.collection}"${avail}`);
    }
    if (!declared.has(propName)) {
      errors.push(`prop "${propName}" is not declared on the template component`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Compile a binding's `source` into the Slice-4 structured query spec for the
 * FIRST matching row. PURE — the live query (compile→run) happens in the async
 * `buildPlanFromPage`; this just shapes the spec (limit 1). Filter ops pass
 * through to the query-compiler, which whitelists them (unknown op → its 400).
 */
export function bindingQuerySpec(binding: BindingRef): BindingQuerySpec {
  return {
    filters: (binding.source.filter ?? []).map((f) => ({ ...f })),
    sort: (binding.source.sort ?? []).map((s) => ({ ...s })),
    limit: 1,
  };
}

/**
 * Hydrate a block's bindings into a NEW props object: for each binding, for each
 * `propName → fieldName` in its map, copy `row[fieldName]` into `props[propName]`.
 * `rows` maps a binding KEY (the key in `block.bindings`) to its resolved first
 * row (or `undefined`/`null` when the query had no match / the collection was
 * dead). GRACEFUL: a missing row, or a field absent from the row, leaves that prop
 * unbound (it keeps any author-set static value, else stays blank) — NEVER throws.
 *
 * The block's own `props` win nothing/everything by design: a bound prop OVERWRITES
 * the static prop (the binding is the live source of truth when it resolves). An
 * unresolved binding does NOT overwrite, so a static fallback prop survives.
 */
export function hydrateProps(
  props: Record<string, unknown> | undefined,
  bindings: Record<string, BindingRef> | undefined,
  rows: Record<string, Record<string, unknown> | null | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(props ?? {}) };
  if (!bindings) return out;

  for (const [key, binding] of Object.entries(bindings)) {
    const row = rows[key];
    if (row == null || typeof row !== "object") continue; // graceful: no match
    for (const [propName, fieldName] of Object.entries(binding.map ?? {})) {
      if (Object.prototype.hasOwnProperty.call(row, fieldName)) {
        out[propName] = row[fieldName];
      }
      // field absent from the row → leave the prop unbound (graceful blank)
    }
  }
  return out;
}
