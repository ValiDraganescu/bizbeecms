/**
 * external-data-sources Slice 3 — PURE glue between the api-kind binding
 * (`BindingRef.source.kind === "api"` / `ListSource.kind === "api"`) and the
 * Slice-2 central fetch engine.
 *
 * The trick that keeps the existing pure renderer UNCHANGED: an api binding's
 * `map` values are dot-paths ("main.temp"), but `hydrateProps` (single-item)
 * and `stampRow` (List) do FLAT `row[fieldName]` lookups. So we FLATTEN each
 * JSON item into a row keyed by exactly those dot-paths (`flattenByPaths`) —
 * the collection code paths then hydrate/stamp api rows verbatim.
 *
 * PURE — no React, no D1, no CF. Node-tested (scripts/data-source-bind.test.mjs).
 * The effectful wrapper (store reads, secret decrypt, Workers cache) lives in
 * `hydrate.ts`; keep it OUT of here so the tests stay dep-free.
 */
import { getPath, type RequestParams } from "./fetch.ts";
import { resolveLocalized } from "../render/localize.ts";

/** Mirrors `ApiBindingParams` (render/plan-types) without importing the renderer. */
export type ApiParamSpec = Record<string, string | { prop: string }>;

/**
 * Resolve a binding's param specs into the concrete `params` for `fetchSource`:
 * a literal string passes through; `{ prop }` reads the block's prop (locale
 * objects resolved via the standard content-locale fallback). GRACEFUL: a
 * missing/non-primitive value is OMITTED — `fetchSource` then reports the
 * missing `{placeholder}` and the renderer degrades to placeholder/empty.
 * Component input is untrusted; encoding happens in `buildRequest`, not here.
 */
export function resolveBindingParams(
  specs: ApiParamSpec | undefined,
  props: Record<string, unknown> | undefined,
  locale: string,
  fallback: string,
): RequestParams {
  const out: RequestParams = {};
  for (const [name, spec] of Object.entries(specs ?? {})) {
    const raw =
      spec != null && typeof spec === "object"
        ? resolveLocalized((props ?? {})[spec.prop], locale, fallback)
        : spec;
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      out[name] = raw;
    }
  }
  return out;
}

/**
 * Flatten one JSON item into a row keyed by the given dot-paths — the shape
 * `hydrateProps`/`stampRow` expect. A path that resolves to `undefined` is left
 * off the row (graceful blank: the author's static prop default survives).
 */
export function flattenByPaths(
  json: unknown,
  paths: Iterable<string>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const path of new Set(paths)) {
    const v = getPath(json, path);
    if (v !== undefined) row[path] = v;
  }
  return row;
}

/**
 * Normalize an api response into the List's element array: `itemsPath` (when
 * set) digs to a nested array (e.g. OpenWeather forecast `{ list: [...] }`);
 * a bare array is used as-is; a lone object becomes a one-element list;
 * anything else → empty (graceful — the List shows its empty-state slot).
 */
export function apiListElements(data: unknown, itemsPath?: string): unknown[] {
  const target = itemsPath ? getPath(data, itemsPath) : data;
  if (Array.isArray(target)) return target;
  if (target != null && typeof target === "object") return [target];
  return [];
}

/**
 * Every dot-path a List row needs flattened: the `listMap` field paths plus the
 * combobox identity/label paths (`valueField`/`labelField`) and `id` (the
 * combobox `rowValue` fallback).
 */
export function listPaths(
  listMap: Record<string, string> | undefined,
  listSource: { valueField?: string; labelField?: string } | undefined,
): string[] {
  const paths = new Set(Object.values(listMap ?? {}));
  if (listSource?.valueField) paths.add(listSource.valueField);
  if (listSource?.labelField) paths.add(listSource.labelField);
  paths.add("id");
  return [...paths];
}
