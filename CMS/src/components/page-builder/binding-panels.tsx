"use client";

import { useTranslations } from "next-intl";
import type { Block, BindingRef, ListSource } from "@/lib/render/tree";
import { normalizeLabelExpr } from "@/lib/render/tree";
import { declaredPropNames } from "@/lib/content/binding";
import {
  FILTER_OPS,
  collectionColumns,
  type CollectionMeta,
  type FilterClause,
  type SortClause,
} from "@/lib/page-builder/types";
import { ctlLabel, ctlInput } from "./shared";

// ── Phase-2 binding authoring (Slice C) ──────────────────────────────────────
//
// Two operator panels in the Block tab:
//  - BindingPanel  → a NORMAL component block's single-item `bindings` (pick a
//    collection → first-match query → map row fields to declared props).
//  - ListSettings  → a built-in `List` block's `listSource`/`listMap` (collection
//    + filter/sort/limit + a per-row template component + field→prop map).
// Both validate client-side via the Slice-A `validateBinding`/`validateListBinding`
// analogs — but here we keep the authoring inline (the validators live in
// lib/content/binding.ts and are reused by the AI tools in Slice D). The renderer
// is graceful, so an in-progress (invalid) binding just renders blank live.

/**
 * A reusable filter[] + sort[] editor over a collection's columns. PURE-ish
 * (controlled): emits new arrays via `onChange`. `is_null`/`not_null` take no
 * value. Used by both the single-item BindingPanel and the List query.
 */
function QueryBuilder({
  columns,
  filters,
  sort,
  onFilters,
  onSort,
}: {
  columns: string[];
  filters: FilterClause[];
  sort: SortClause[];
  onFilters: (f: FilterClause[]) => void;
  onSort: (s: SortClause[]) => void;
}) {
  const t = useTranslations("pageBuilder");
  const firstCol = columns[0] ?? "";
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <span className={ctlLabel}>{t("bind.filters")}</span>
        {filters.map((f, i) => {
          const noValue = f.op === "is_null" || f.op === "not_null";
          return (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <select
                className={`${ctlInput} flex-1`}
                value={f.field}
                aria-label={t("bind.field")}
                onChange={(e) =>
                  onFilters(filters.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))
                }
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className={`${ctlInput} w-24`}
                value={f.op}
                aria-label={t("bind.op")}
                onChange={(e) =>
                  onFilters(filters.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))
                }
              >
                {FILTER_OPS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              {!noValue && (
                <input
                  type="text"
                  className={`${ctlInput} flex-1`}
                  value={f.value == null ? "" : String(f.value)}
                  placeholder={t("bind.value")}
                  aria-label={t("bind.value")}
                  onChange={(e) =>
                    onFilters(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                />
              )}
              <button
                type="button"
                aria-label={t("bind.removeFilter")}
                className="rounded-md border border-border px-2 py-1 text-xs text-foreground-muted hover:bg-surface-muted"
                onClick={() => onFilters(filters.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          type="button"
          disabled={columns.length === 0}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-foreground hover:bg-surface-muted disabled:opacity-50"
          onClick={() => onFilters([...filters, { field: firstCol, op: "eq", value: "" }])}
        >
          + {t("bind.addFilter")}
        </button>
      </div>

      <div className="space-y-2">
        <span className={ctlLabel}>{t("bind.sort")}</span>
        {sort.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select
              className={`${ctlInput} flex-1`}
              value={s.field}
              aria-label={t("bind.field")}
              onChange={(e) =>
                onSort(sort.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))
              }
            >
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className={`${ctlInput} w-24`}
              value={s.dir ?? "asc"}
              aria-label={t("bind.dir")}
              onChange={(e) =>
                onSort(sort.map((x, j) => (j === i ? { ...x, dir: e.target.value as "asc" | "desc" } : x)))
              }
            >
              <option value="asc">{t("bind.asc")}</option>
              <option value="desc">{t("bind.desc")}</option>
            </select>
            <button
              type="button"
              aria-label={t("bind.removeSort")}
              className="rounded-md border border-border px-2 py-1 text-xs text-foreground-muted hover:bg-surface-muted"
              onClick={() => onSort(sort.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={columns.length === 0}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-foreground hover:bg-surface-muted disabled:opacity-50"
          onClick={() => onSort([...sort, { field: firstCol, dir: "asc" }])}
        >
          + {t("bind.addSort")}
        </button>
      </div>
    </div>
  );
}

/**
 * Single-item binding panel for a NORMAL component block. Authors ONE binding
 * (key `"item"`): a collection + first-match query (filter/sort) + a map of
 * `declaredProp → collectionField`. Writing an empty map clears the binding (the
 * block reverts to its static props). The renderer picks the first matching row
 * and overwrites the mapped props; unresolved → graceful blank.
 */
export function BindingPanel({
  block,
  collections,
  declared,
  onChange,
}: {
  block: Block;
  collections: CollectionMeta[];
  declared: string[];
  onChange: (bindings: Record<string, BindingRef> | undefined) => void;
}) {
  const t = useTranslations("pageBuilder");
  const current = block.bindings?.item;
  const collection = current?.source.collection ?? "";
  const meta = collections.find((c) => c.tableName === collection);
  const columns = collectionColumns(meta);
  const map = current?.map ?? {};
  const filters = (current?.source.filter ?? []) as FilterClause[];
  const sort = (current?.source.sort ?? []) as SortClause[];

  // Rebuild the whole binding from parts; an empty collection clears it.
  function emit(next: Partial<BindingRef["source"]> & { map?: Record<string, string> }) {
    const src = {
      collection: next.collection ?? collection,
      filter: next.filter ?? filters,
      sort: next.sort ?? sort,
    };
    const m = next.map ?? map;
    if (!src.collection) {
      onChange(undefined);
      return;
    }
    const binding: BindingRef = {
      source: {
        collection: src.collection,
        ...(src.filter && src.filter.length ? { filter: src.filter } : {}),
        ...(src.sort && src.sort.length ? { sort: src.sort } : {}),
      },
      map: m,
    };
    onChange({ item: binding });
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">{t("bind.title")}</h3>
      <p className="text-xs text-foreground-muted">{t("bind.help")}</p>

      <label className="flex flex-col gap-1.5">
        <span className={ctlLabel}>{t("bind.collection")}</span>
        <select
          className={ctlInput}
          value={collection}
          aria-label={t("bind.collection")}
          onChange={(e) => emit({ collection: e.target.value, filter: [], sort: [], map: {} })}
        >
          <option value="">{t("bind.none")}</option>
          {collections.map((c) => (
            <option key={c.tableName} value={c.tableName}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {collections.length === 0 && (
        <p className="text-xs text-foreground-muted">{t("bind.noCollections")}</p>
      )}

      {collection && (
        <>
          <QueryBuilder
            columns={columns}
            filters={filters}
            sort={sort}
            onFilters={(f) => emit({ filter: f })}
            onSort={(s) => emit({ sort: s })}
          />

          <div className="space-y-2">
            <span className={ctlLabel}>{t("bind.map")}</span>
            {declared.length === 0 ? (
              <p className="text-xs text-foreground-muted">{t("bind.noProps")}</p>
            ) : (
              declared.map((prop) => (
                <label key={prop} className="flex items-center gap-2">
                  <span className="w-1/3 truncate font-mono text-xs text-foreground">{prop}</span>
                  <select
                    className={`${ctlInput} flex-1`}
                    value={map[prop] ?? ""}
                    aria-label={`${t("bind.mapProp")} ${prop}`}
                    onChange={(e) => {
                      const next = { ...map };
                      if (e.target.value) next[prop] = e.target.value;
                      else delete next[prop];
                      emit({ map: next });
                    }}
                  >
                    <option value="">{t("bind.unmapped")}</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * List block settings: pick the source collection + query (filter/sort/limit),
 * pick the per-row TEMPLATE component (set as the List's single child), and map
 * each row field → the template's declared props (`listMap`). Empty/dead query →
 * the renderer shows the empty-state slot (or nothing). The template child is set
 * by component NAME (DnD into a List isn't wired this slice — a select is enough).
 */
export function ListSettings({
  block,
  collections,
  propsSchemas,
  onChange,
}: {
  block: Block;
  collections: CollectionMeta[];
  propsSchemas: Record<string, string | null>;
  onChange: (
    patch: Partial<Pick<Block, "listSource" | "listMap">> & { __child?: Block[] },
  ) => void;
}) {
  const t = useTranslations("pageBuilder");
  const source = block.listSource;
  const collection = source?.collection ?? "";
  const meta = collections.find((c) => c.tableName === collection);
  const columns = collectionColumns(meta);
  const filters = (source?.filter ?? []) as FilterClause[];
  const sort = (source?.sort ?? []) as SortClause[];
  const limit = source?.limit;
  const listMap = block.listMap ?? {};

  // The template component is the List's first non-empty-role child.
  const template = (block.children ?? []).find((c) => c.listRole !== "empty") ?? null;
  const templateName = template?.component ?? "";
  const templateProps = template ? [...declaredPropNames(propsSchemas[template.component])] : [];
  const componentNames = Object.keys(propsSchemas).sort();

  const presentation = source?.presentation ?? "list";
  // Carry the combobox config through edits (emitSource rebuilds `src` fresh).
  const cb = {
    select: source?.select,
    min: source?.min,
    max: source?.max,
    searchable: source?.searchable,
    valueField: source?.valueField,
    labelField: source?.labelField,
    labelExpr: source?.labelExpr,
    name: source?.name,
    placeholder: source?.placeholder,
    searchPlaceholder: source?.searchPlaceholder,
  };

  function emitSource(next: Partial<ListSource>) {
    const pres = "presentation" in next ? next.presentation : presentation;
    const src: ListSource = {
      collection: next.collection ?? collection,
      ...(() => {
        const f = next.filter ?? filters;
        return f.length ? { filter: f } : {};
      })(),
      ...(() => {
        const s = next.sort ?? sort;
        return s.length ? { sort: s } : {};
      })(),
      ...(() => {
        const l = "limit" in next ? next.limit : limit;
        return l != null ? { limit: l } : {};
      })(),
    };
    // Persist presentation + combobox config only in combobox mode (keeps plain
    // Lists byte-identical to before). Each field carries over unless overridden.
    if (pres === "combobox") {
      src.presentation = "combobox";
      const merged = { ...cb, ...next };
      if (merged.select) src.select = merged.select;
      if (merged.min != null) src.min = merged.min;
      if (merged.max != null) src.max = merged.max;
      if (merged.searchable != null) src.searchable = merged.searchable;
      if (merged.valueField) src.valueField = merged.valueField;
      if (merged.labelField) src.labelField = merged.labelField;
      // Store a bare template-literal body (strip backticks the operator may type
      // by copying the help-text example); the renderer wraps it. See normalizeLabelExpr.
      {
        const le = normalizeLabelExpr(merged.labelExpr);
        if (le) src.labelExpr = le;
      }
      if (merged.name) src.name = merged.name;
      if (merged.placeholder) src.placeholder = merged.placeholder;
      if (merged.searchPlaceholder) src.searchPlaceholder = merged.searchPlaceholder;
    }
    onChange(src.collection ? { listSource: src } : { listSource: undefined });
  }

  return (
    <section className="space-y-4">
      <p className="font-mono text-sm text-foreground">{t("list.title")}</p>
      <p className="text-xs text-foreground-muted">{t("list.help")}</p>

      <label className="flex flex-col gap-1.5">
        <span className={ctlLabel}>{t("bind.collection")}</span>
        <select
          className={ctlInput}
          value={collection}
          aria-label={t("bind.collection")}
          onChange={(e) => {
            emitSource({ collection: e.target.value, filter: [], sort: [] });
            onChange({ listMap: {} });
          }}
        >
          <option value="">{t("bind.none")}</option>
          {collections.map((c) => (
            <option key={c.tableName} value={c.tableName}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {collections.length === 0 && (
        <p className="text-xs text-foreground-muted">{t("bind.noCollections")}</p>
      )}

      {collection && (
        <>
          <QueryBuilder
            columns={columns}
            filters={filters}
            sort={sort}
            onFilters={(f) => emitSource({ filter: f })}
            onSort={(s) => emitSource({ sort: s })}
          />

          <label className="flex flex-col gap-1.5">
            <span className={ctlLabel}>{t("list.limit")}</span>
            <input
              type="number"
              min={1}
              className={ctlInput}
              value={limit ?? ""}
              placeholder={t("list.limitPlaceholder")}
              aria-label={t("list.limit")}
              onChange={(e) =>
                emitSource({ limit: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          </label>

          <label className="flex flex-col gap-1.5 border-t border-border pt-4">
            <span className={ctlLabel}>{t("list.template")}</span>
            <select
              className={ctlInput}
              value={templateName}
              aria-label={t("list.template")}
              onChange={(e) => {
                const name = e.target.value;
                // Keep any empty-state child; replace the single template child.
                const empties = (block.children ?? []).filter((c) => c.listRole === "empty");
                const child: Block[] = name
                  ? [{ id: `${block.id}-tpl`, component: name, listRole: "template" }, ...empties]
                  : empties;
                onChange({ __child: child, listMap: {} });
              }}
            >
              <option value="">{t("list.pickTemplate")}</option>
              {componentNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          {templateName && (
            <label className="flex flex-col gap-1.5 border-t border-border pt-4">
              <span className={ctlLabel}>Presentation</span>
              <select
                className={ctlInput}
                value={presentation}
                aria-label="Presentation"
                onChange={(e) => emitSource({ presentation: e.target.value as "list" | "combobox" })}
              >
                <option value="list">List — show all rows</option>
                <option value="combobox">Combobox — select from rows in a dropdown</option>
              </select>
              <span className="text-xs text-foreground-muted">
                {presentation === "combobox"
                  ? `Each row renders as ${templateName} inside a selectable dropdown; the combobox owns selection, search and limits.`
                  : `Repeats ${templateName} once per matching row.`}
              </span>
            </label>
          )}

          {/* Combobox config — rides on this same panel. */}
          {templateName && presentation === "combobox" && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>Selection</span>
                <select
                  className={ctlInput}
                  value={cb.select ?? "multiple"}
                  aria-label="Selection mode"
                  onChange={(e) => emitSource({ select: e.target.value as "single" | "multiple" })}
                >
                  <option value="multiple">Multiple</option>
                  <option value="single">Single</option>
                </select>
              </label>
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className={ctlLabel}>Min</span>
                  <input
                    type="number"
                    min={0}
                    className={ctlInput}
                    value={cb.min ?? ""}
                    placeholder="0"
                    aria-label="Minimum selectable"
                    onChange={(e) => emitSource({ min: e.target.value === "" ? undefined : Number(e.target.value) })}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className={ctlLabel}>Max (0 = ∞)</span>
                  <input
                    type="number"
                    min={0}
                    className={ctlInput}
                    value={cb.max ?? ""}
                    placeholder="0"
                    aria-label="Maximum selectable"
                    onChange={(e) => emitSource({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={cb.searchable !== false}
                  aria-label="Searchable"
                  onChange={(e) => emitSource({ searchable: e.target.checked })}
                />
                Searchable
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>Value field (option identity)</span>
                <select
                  className={ctlInput}
                  value={cb.valueField ?? ""}
                  aria-label="Value field"
                  onChange={(e) => emitSource({ valueField: e.target.value || undefined })}
                >
                  <option value="">id (default)</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>Label field (selected-item chip)</span>
                <select
                  className={ctlInput}
                  value={cb.labelField ?? ""}
                  aria-label="Label field"
                  onChange={(e) => emitSource({ labelField: e.target.value || undefined })}
                >
                  <option value="">component text (default)</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>Label expression (advanced)</span>
                <input
                  type="text"
                  className={`${ctlInput} font-mono`}
                  value={cb.labelExpr ?? ""}
                  placeholder={"${name} · ★ ${rating}"}
                  aria-label="Label expression"
                  onChange={(e) => emitSource({ labelExpr: e.target.value || undefined })}
                />
                <span className="text-xs text-foreground-muted">
                  A template for the chip text — use <code>{"${field}"}</code> for row values, e.g. <code>{"${name} · ${location}"}</code>. No backticks needed. Overrides the label field.
                </span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>Form field name</span>
                <input
                  type="text"
                  className={ctlInput}
                  value={cb.name ?? ""}
                  placeholder="selection"
                  aria-label="Form field name"
                  onChange={(e) => emitSource({ name: e.target.value || undefined })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>Placeholder</span>
                <input
                  type="text"
                  className={ctlInput}
                  value={cb.placeholder ?? ""}
                  placeholder="Select…"
                  aria-label="Placeholder"
                  onChange={(e) => emitSource({ placeholder: e.target.value || undefined })}
                />
              </label>
            </div>
          )}

          {/* Field map — the row→item-component binding, used in BOTH presentations. */}
          {templateName && (
            <div className="space-y-2">
              <span className={ctlLabel}>{t("list.map")}</span>
              {templateProps.length === 0 ? (
                <p className="text-xs text-foreground-muted">{t("bind.noProps")}</p>
              ) : (
                templateProps.map((prop) => (
                  <label key={prop} className="flex items-center gap-2">
                    <span className="w-1/3 truncate font-mono text-xs text-foreground">{prop}</span>
                    <select
                      className={`${ctlInput} flex-1`}
                      value={listMap[prop] ?? ""}
                      aria-label={`${t("bind.mapProp")} ${prop}`}
                      onChange={(e) => {
                        const next = { ...listMap };
                        if (e.target.value) next[prop] = e.target.value;
                        else delete next[prop];
                        onChange({ listMap: next });
                      }}
                    >
                      <option value="">{t("bind.unmapped")}</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                ))
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
