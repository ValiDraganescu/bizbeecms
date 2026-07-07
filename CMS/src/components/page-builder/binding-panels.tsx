"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Block, BindingRef, ListSource, ApiBindingParams, FormTarget } from "@/lib/render/tree";
import { normalizeLabelExpr } from "@/lib/render/tree";
import { FORM_DEFAULT_SUCCESS, FORM_DEFAULT_ERROR } from "@/lib/render/plan-form";
import { declaredPropNames, firstBinding } from "@/lib/content/binding";
import { requestPlaceholders } from "@/lib/data-sources/validate";
import { apiListElements, samplePaths } from "@/lib/data-sources/bind";
import {
  FILTER_OPS,
  collectionColumns,
  type ApiRequestMeta,
  type ApiSourceMeta,
  type CollectionMeta,
  type FilterClause,
  type SortClause,
} from "@/lib/page-builder/types";
import { ctlLabel, ctlInput, SpacingControls, UnitNumberInput } from "./shared";
import { NumberInput } from "@/components/ui/number-input";

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
//
// external-data-sources Slice 5: the source picker lists Collections AND API
// data sources (same select, two optgroups). An api-kind source swaps the
// query builder for: saved-request picker + `{placeholder}` param passing
// (literal or block prop) + dot-path field maps, with a "load sample" button
// (the Slice-4 test endpoint) that feeds a <datalist> of suggested paths.

// The combined source <select> encodes kind in the option value.
const COLLECTION_PREFIX = "c:";
const API_PREFIX = "a:";

/**
 * Per-`{placeholder}` param editor for an api-kind source: each placeholder is
 * a literal text value or (when the block declares props) read from a prop at
 * render time — the Slice-3 hydration resolves `{ prop }` specs.
 */
function ApiParamsEditor({
  placeholders,
  params,
  propNames,
  onChange,
}: {
  placeholders: string[];
  params: ApiBindingParams;
  propNames: string[];
  onChange: (params: ApiBindingParams) => void;
}) {
  const t = useTranslations("pageBuilder");
  if (placeholders.length === 0) return null;
  return (
    <div className="space-y-2">
      <span className={ctlLabel}>{t("bind.params")}</span>
      {placeholders.map((name) => {
        const v = params[name];
        const isProp = v != null && typeof v === "object";
        return (
          <div key={name} className="flex items-center gap-2">
            <span className="w-1/3 truncate font-mono text-xs text-foreground">{name}</span>
            {propNames.length > 0 && (
              <select
                className={`${ctlInput} w-28`}
                value={isProp ? `p:${v.prop}` : "lit"}
                aria-label={`${t("bind.paramSource")} ${name}`}
                onChange={(e) => {
                  const next = { ...params };
                  if (e.target.value === "lit") next[name] = "";
                  else next[name] = { prop: e.target.value.slice(2) };
                  onChange(next);
                }}
              >
                <option value="lit">{t("bind.paramLiteral")}</option>
                {propNames.map((p) => (
                  <option key={p} value={`p:${p}`}>
                    {t("bind.paramProp")} {p}
                  </option>
                ))}
              </select>
            )}
            {!isProp && (
              <input
                type="text"
                className={`${ctlInput} flex-1`}
                value={typeof v === "string" ? v : ""}
                placeholder={t("bind.value")}
                aria-label={`${t("bind.paramValue")} ${name}`}
                onChange={(e) => onChange({ ...params, [name]: e.target.value })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * "Load sample response" — runs the saved request through the Slice-4 test
 * endpoint (admin-gated, cache-bypassed, secret server-side) and reports the
 * sample's leaf dot-paths back to the panel as map suggestions. `{ prop }`
 * params resolve best-effort from the block's CURRENT prop value.
 */
function SampleLoader({
  sourceId,
  requestId,
  params,
  blockProps,
  toItem,
  onPaths,
}: {
  sourceId: string;
  requestId: string;
  params: ApiBindingParams;
  blockProps: Record<string, unknown> | undefined;
  toItem: (data: unknown) => unknown;
  onPaths: (paths: string[]) => void;
}) {
  const t = useTranslations("pageBuilder");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [count, setCount] = useState(0);
  const [preview, setPreview] = useState("");

  async function load() {
    setState("loading");
    try {
      const literals: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        if (typeof v === "string") literals[k] = v;
        else {
          const raw = blockProps?.[v.prop];
          if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
            literals[k] = String(raw);
          }
        }
      }
      const res = await fetch(`/api/data-sources/${sourceId}/requests/${requestId}/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ params: literals }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: unknown } | null;
      if (!res.ok || !body?.ok) {
        setState("fail");
        return;
      }
      const paths = samplePaths(toItem(body.data));
      onPaths(paths);
      setCount(paths.length);
      setPreview(JSON.stringify(body.data, null, 1)?.slice(0, 1500) ?? "");
      setState("ok");
    } catch {
      setState("fail");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={state === "loading"}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-foreground hover:bg-surface-muted disabled:opacity-50"
        onClick={() => void load()}
      >
        {state === "loading" ? t("bind.sampleLoading") : t("bind.loadSample")}
      </button>
      {state === "ok" && (
        <>
          <p role="status" className="text-xs text-foreground-muted">
            {t("bind.sampleLoaded", { count })}
          </p>
          <pre className="max-h-40 overflow-auto rounded-md border border-border bg-surface-muted p-2 font-mono text-[11px] text-foreground">
            {preview}
          </pre>
        </>
      )}
      {state === "fail" && (
        <p role="alert" className="text-xs text-danger">
          {t("bind.sampleFailed")}
        </p>
      )}
    </div>
  );
}

/** Dot-path map editor (api kind): prop → free-text path with datalist hints. */
function DotPathMap({
  label,
  declared,
  map,
  suggestions,
  datalistId,
  onChange,
}: {
  label: string;
  declared: string[];
  map: Record<string, string>;
  suggestions: string[];
  datalistId: string;
  onChange: (map: Record<string, string>) => void;
}) {
  const t = useTranslations("pageBuilder");
  return (
    <div className="space-y-2">
      <span className={ctlLabel}>{label}</span>
      <p className="text-xs text-foreground-muted">{t("bind.apiMapHelp")}</p>
      {declared.length === 0 ? (
        <p className="text-xs text-foreground-muted">{t("bind.noProps")}</p>
      ) : (
        declared.map((prop) => (
          <label key={prop} className="flex items-center gap-2">
            <span className="w-1/3 truncate font-mono text-xs text-foreground">{prop}</span>
            <input
              type="text"
              list={datalistId}
              className={`${ctlInput} flex-1 font-mono`}
              value={map[prop] ?? ""}
              placeholder={t("bind.pathPlaceholder")}
              aria-label={`${t("bind.mapProp")} ${prop}`}
              onChange={(e) => {
                const next = { ...map };
                if (e.target.value) next[prop] = e.target.value;
                else delete next[prop];
                onChange(next);
              }}
            />
          </label>
        ))
      )}
      <datalist id={datalistId}>
        {suggestions.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
}

/** The combined Collections + API sources picker (one select, two optgroups). */
function SourceSelect({
  value,
  collections,
  apiSources,
  onPick,
}: {
  value: string;
  collections: CollectionMeta[];
  apiSources: ApiSourceMeta[];
  onPick: (v: string) => void;
}) {
  const t = useTranslations("pageBuilder");
  return (
    <label className="flex flex-col gap-1.5">
      <span className={ctlLabel}>{t("bind.source")}</span>
      <select
        className={ctlInput}
        value={value}
        aria-label={t("bind.source")}
        onChange={(e) => onPick(e.target.value)}
      >
        <option value="">{t("bind.none")}</option>
        {collections.length > 0 && (
          <optgroup label={t("bind.groupCollections")}>
            {collections.map((c) => (
              <option key={c.tableName} value={`${COLLECTION_PREFIX}${c.tableName}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
        {apiSources.length > 0 && (
          <optgroup label={t("bind.groupApis")}>
            {apiSources.map((s) => (
              <option key={s.id} value={`${API_PREFIX}${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

/** Saved-request picker for a chosen api source. */
function RequestSelect({
  source,
  requestId,
  onPick,
}: {
  source: ApiSourceMeta | undefined;
  requestId: string;
  onPick: (id: string) => void;
}) {
  const t = useTranslations("pageBuilder");
  const requests = source?.requests ?? [];
  return (
    <label className="flex flex-col gap-1.5">
      <span className={ctlLabel}>{t("bind.request")}</span>
      <select
        className={ctlInput}
        value={requestId}
        aria-label={t("bind.request")}
        onChange={(e) => onPick(e.target.value)}
      >
        <option value="">{t("bind.pickRequest")}</option>
        {requests.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} ({r.method} {r.path})
          </option>
        ))}
      </select>
      {requests.length === 0 && (
        <span className="text-xs text-foreground-muted">{t("bind.noRequests")}</span>
      )}
    </label>
  );
}

/** Placeholders of a saved request, [] when none chosen. */
function placeholdersOf(request: ApiRequestMeta | undefined): string[] {
  return request ? requestPlaceholders(request) : [];
}

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
          // Row-scoped aria-labels via plain concat (ICU-brace caveat): with
          // several rows, identical labels are ambiguous to screen readers.
          const row = `${t("bind.filters")} ${i + 1}`;
          return (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <select
                className={`${ctlInput} flex-1`}
                value={f.field}
                aria-label={`${t("bind.field")} — ${row}`}
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
                aria-label={`${t("bind.op")} — ${row}`}
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
                  aria-label={`${t("bind.value")} — ${row}`}
                  onChange={(e) =>
                    onFilters(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                />
              )}
              <button
                type="button"
                aria-label={`${t("bind.removeFilter")} — ${f.field} (${i + 1})`}
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
              aria-label={`${t("bind.field")} — ${t("bind.sort")} ${i + 1}`}
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
              aria-label={`${t("bind.dir")} — ${t("bind.sort")} ${i + 1}`}
              onChange={(e) =>
                onSort(sort.map((x, j) => (j === i ? { ...x, dir: e.target.value as "asc" | "desc" } : x)))
              }
            >
              <option value="asc">{t("bind.asc")}</option>
              <option value="desc">{t("bind.desc")}</option>
            </select>
            <button
              type="button"
              aria-label={`${t("bind.removeSort")} — ${s.field} (${i + 1})`}
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
  apiSources,
  declared,
  onChange,
}: {
  block: Block;
  collections: CollectionMeta[];
  apiSources: ApiSourceMeta[];
  declared: string[];
  onChange: (bindings: Record<string, BindingRef> | undefined) => void;
}) {
  const t = useTranslations("pageBuilder");
  // The renderer hydrates EVERY bindings key; the panel authors ONE. Read the
  // first entry (hand-built/AI binds may key it "api" etc., not just "item")
  // and write back under the SAME key so edits round-trip (P1 fix 2026-07-02).
  const [bindingKey, current] = firstBinding(block.bindings);
  const kind = current?.source.kind === "api" ? "api" : "collection";
  const collection = current?.source.collection ?? "";
  const meta = collections.find((c) => c.tableName === collection);
  const columns = collectionColumns(meta);
  const map = current?.map ?? {};
  const filters = (current?.source.filter ?? []) as FilterClause[];
  const sort = (current?.source.sort ?? []) as SortClause[];

  // api kind (external-data-sources Slice 5)
  const apiSourceId = current?.source.sourceId ?? "";
  const apiRequestId = current?.source.requestId ?? "";
  const apiParams = current?.source.params ?? {};
  const apiSource = apiSources.find((s) => s.id === apiSourceId);
  const apiRequest = apiSource?.requests.find((r) => r.id === apiRequestId);
  const [apiPaths, setApiPaths] = useState<string[]>([]);

  /** Rebuild the api-kind binding from parts (an empty sourceId clears it). */
  function emitApi(next: {
    sourceId?: string;
    requestId?: string;
    params?: ApiBindingParams;
    map?: Record<string, string>;
  }) {
    const sourceId = next.sourceId ?? apiSourceId;
    if (!sourceId) {
      onChange(undefined);
      return;
    }
    onChange({
      [bindingKey]: {
        source: {
          kind: "api",
          sourceId,
          requestId: next.requestId ?? apiRequestId,
          params: next.params ?? apiParams,
        },
        map: next.map ?? map,
      },
    });
  }

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
    onChange({ [bindingKey]: binding });
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">{t("bind.title")}</h3>
      <p className="text-xs text-foreground-muted">{t("bind.help")}</p>

      <SourceSelect
        value={kind === "api" ? (apiSourceId ? `${API_PREFIX}${apiSourceId}` : "") : collection ? `${COLLECTION_PREFIX}${collection}` : ""}
        collections={collections}
        apiSources={apiSources}
        onPick={(v) => {
          setApiPaths([]);
          if (!v) onChange(undefined);
          else if (v.startsWith(COLLECTION_PREFIX))
            emit({ collection: v.slice(COLLECTION_PREFIX.length), filter: [], sort: [], map: {} });
          else {
            const id = v.slice(API_PREFIX.length);
            const s = apiSources.find((x) => x.id === id);
            emitApi({ sourceId: id, requestId: s?.requests[0]?.id ?? "", params: {}, map: {} });
          }
        }}
      />

      {collections.length === 0 && apiSources.length === 0 && (
        <p className="text-xs text-foreground-muted">{t("bind.noSources")}</p>
      )}

      {kind === "collection" && collection && (
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

      {kind === "api" && apiSourceId && (
        <>
          <RequestSelect
            source={apiSource}
            requestId={apiRequestId}
            onPick={(id) => {
              setApiPaths([]);
              emitApi({ requestId: id, params: {} });
            }}
          />

          {apiRequest && (
            <>
              <ApiParamsEditor
                placeholders={placeholdersOf(apiRequest)}
                params={apiParams}
                propNames={declared}
                onChange={(p) => emitApi({ params: p })}
              />
              <SampleLoader
                sourceId={apiSourceId}
                requestId={apiRequestId}
                params={apiParams}
                blockProps={block.props}
                toItem={(data) => (Array.isArray(data) ? data[0] : data)}
                onPaths={setApiPaths}
              />
              <DotPathMap
                label={t("bind.map")}
                declared={declared}
                map={map}
                suggestions={apiPaths}
                datalistId={`bind-paths-${block.id}`}
                onChange={(m) => emitApi({ map: m })}
              />
            </>
          )}
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
  apiSources,
  propsSchemas,
  onChange,
  onProps,
}: {
  block: Block;
  collections: CollectionMeta[];
  apiSources: ApiSourceMeta[];
  propsSchemas: Record<string, string | null>;
  onChange: (
    patch: Partial<Pick<Block, "listSource" | "listMap">> & { __child?: Block[] },
  ) => void;
  onProps: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const source = block.listSource;
  const kind = source?.kind === "api" ? "api" : "collection";
  const collection = source?.collection ?? "";
  const meta = collections.find((c) => c.tableName === collection);
  const columns = collectionColumns(meta);
  const filters = (source?.filter ?? []) as FilterClause[];
  const sort = (source?.sort ?? []) as SortClause[];
  const limit = source?.limit;
  const listMap = block.listMap ?? {};

  // api kind (external-data-sources Slice 5)
  const apiSourceId = source?.sourceId ?? "";
  const apiRequestId = source?.requestId ?? "";
  const apiParams = source?.params ?? {};
  const itemsPath = source?.itemsPath ?? "";
  const apiSource = apiSources.find((s) => s.id === apiSourceId);
  const apiRequest = apiSource?.requests.find((r) => r.id === apiRequestId);
  const [apiPaths, setApiPaths] = useState<string[]>([]);

  // The template component is the List's first non-empty-role child.
  const template = (block.children ?? []).find((c) => c.listRole !== "empty") ?? null;
  const templateName = template?.component ?? "";
  const templateProps = template ? [...declaredPropNames(propsSchemas[template.component])] : [];
  const componentNames = Object.keys(propsSchemas).sort();

  const presentation = source?.presentation ?? "list";
  // Carry the plain-list LAYOUT config through edits (rebuilt fresh in emitSource).
  const layout = {
    direction: source?.direction,
    columns: source?.columns,
    columnsTablet: source?.columnsTablet,
    columnsMobile: source?.columnsMobile,
    gap: source?.gap,
    gapUnit: source?.gapUnit,
    maxSize: source?.maxSize,
    maxSizeUnit: source?.maxSizeUnit,
    autoscroll: source?.autoscroll,
    autoscrollSpeed: source?.autoscrollSpeed,
    itemList: source?.itemList,
  };
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
    // Which kind this edit targets: explicit in the patch, else the current one.
    const k = ("kind" in next ? next.kind : kind) === "api" ? "api" : "collection";
    // api-kind sources persist ids/params/itemsPath; collection kind stays
    // byte-identical to before (no `kind` field on legacy collection lists).
    const src: ListSource =
      k === "api"
        ? {
            kind: "api",
            sourceId: next.sourceId ?? apiSourceId,
            requestId: next.requestId ?? apiRequestId,
            params: next.params ?? apiParams,
            ...(() => {
              const p = "itemsPath" in next ? next.itemsPath : itemsPath;
              return p ? { itemsPath: p } : {};
            })(),
          }
        : {
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
    // Plain-list LAYOUT (direction/scroll/auto-scroll) — persisted only OUTSIDE
    // combobox mode (a combobox is a dropdown; scroll options don't apply). Each
    // field carries over unless this edit overrides it.
    if (pres !== "combobox") {
      const l = { ...layout, ...next };
      if (l.direction && l.direction !== "vertical") src.direction = l.direction;
      if (l.direction === "grid") {
        if (l.columns != null) src.columns = l.columns;
        if (l.columnsTablet != null) src.columnsTablet = l.columnsTablet;
        if (l.columnsMobile != null) src.columnsMobile = l.columnsMobile;
      }
      if (l.gap != null) src.gap = l.gap;
      // Units persist only when non-default (rem) so px lists stay byte-identical.
      if (l.gapUnit === "rem") src.gapUnit = "rem";
      if (l.maxSize != null) src.maxSize = l.maxSize;
      if (l.maxSizeUnit === "rem") src.maxSizeUnit = "rem";
      if (l.autoscroll) src.autoscroll = true;
      if (l.autoscrollSpeed && l.autoscrollSpeed !== "normal") src.autoscrollSpeed = l.autoscrollSpeed;
      if (l.itemList) src.itemList = true;
    }
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
    const hasSource = src.kind === "api" ? Boolean(src.sourceId) : Boolean(src.collection);
    onChange(hasSource ? { listSource: src } : { listSource: undefined });
  }

  return (
    <section className="space-y-4">
      <p className="font-mono text-sm text-foreground">{t("list.title")}</p>
      <SpacingControls props={block.props ?? {}} onPatch={onProps} />
      <p className="text-xs text-foreground-muted">{t("list.help")}</p>

      <SourceSelect
        value={
          kind === "api"
            ? apiSourceId
              ? `${API_PREFIX}${apiSourceId}`
              : ""
            : collection
              ? `${COLLECTION_PREFIX}${collection}`
              : ""
        }
        collections={collections}
        apiSources={apiSources}
        onPick={(v) => {
          setApiPaths([]);
          if (!v) {
            onChange({ listSource: undefined, listMap: {} });
          } else if (v.startsWith(COLLECTION_PREFIX)) {
            emitSource({
              kind: "collection",
              collection: v.slice(COLLECTION_PREFIX.length),
              filter: [],
              sort: [],
            });
            onChange({ listMap: {} });
          } else {
            const id = v.slice(API_PREFIX.length);
            const s = apiSources.find((x) => x.id === id);
            emitSource({
              kind: "api",
              sourceId: id,
              requestId: s?.requests[0]?.id ?? "",
              params: {},
              itemsPath: undefined,
            });
            onChange({ listMap: {} });
          }
        }}
      />

      {collections.length === 0 && apiSources.length === 0 && (
        <p className="text-xs text-foreground-muted">{t("bind.noSources")}</p>
      )}

      {kind === "api" && apiSourceId && (
        <>
          <RequestSelect
            source={apiSource}
            requestId={apiRequestId}
            onPick={(id) => {
              setApiPaths([]);
              emitSource({ requestId: id, params: {} });
            }}
          />

          {apiRequest && (
            <>
              {/* ponytail: List params are literal-only — a built-in List block has
                  no declared props to read from; prop-mode arrives with a use case. */}
              <ApiParamsEditor
                placeholders={placeholdersOf(apiRequest)}
                params={apiParams}
                propNames={[]}
                onChange={(p) => emitSource({ params: p })}
              />

              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>{t("bind.itemsPath")}</span>
                <input
                  type="text"
                  className={`${ctlInput} font-mono`}
                  value={itemsPath}
                  placeholder="list"
                  aria-label={t("bind.itemsPath")}
                  onChange={(e) => emitSource({ itemsPath: e.target.value || undefined })}
                />
                <span className="text-xs text-foreground-muted">{t("bind.itemsPathHint")}</span>
              </label>

              <SampleLoader
                sourceId={apiSourceId}
                requestId={apiRequestId}
                params={apiParams}
                blockProps={block.props}
                toItem={(data) => apiListElements(data, itemsPath || undefined)[0]}
                onPaths={setApiPaths}
              />
            </>
          )}
        </>
      )}

      {kind === "collection" && collection && (
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
            <NumberInput
              min={1}
              className={ctlInput}
              value={limit}
              placeholder={t("list.limitPlaceholder")}
              ariaLabel={t("list.limit")}
              onValue={(v) => emitSource({ limit: v })}
            />
          </label>
        </>
      )}

      {/* From here down (template / presentation / layout / map) both kinds share
          the UI; only the field pickers differ (columns vs dot-paths). */}
      {(kind === "api" ? apiSourceId : collection) && (
        <>
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
              <span className={ctlLabel}>{t("list.presentation")}</span>
              <select
                className={ctlInput}
                value={presentation}
                aria-label={t("list.presentation")}
                onChange={(e) => emitSource({ presentation: e.target.value as "list" | "combobox" })}
              >
                <option value="list">{t("list.presentationList")}</option>
                <option value="combobox">{t("list.presentationCombobox")}</option>
              </select>
              <span className="text-xs text-foreground-muted">
                {presentation === "combobox"
                  ? t("list.presentationComboboxHint", { template: templateName })
                  : t("list.presentationListHint", { template: templateName })}
              </span>
            </label>
          )}

          {/* Plain-list LAYOUT — direction, scroll cap, seamless auto-scroll. */}
          {templateName && presentation === "list" && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>{t("list.direction")}</span>
                <select
                  className={ctlInput}
                  value={layout.direction ?? "vertical"}
                  aria-label={t("list.direction")}
                  onChange={(e) =>
                    emitSource({
                      direction: e.target.value as "vertical" | "horizontal" | "grid",
                    })
                  }
                >
                  <option value="vertical">{t("list.directionVertical")}</option>
                  <option value="horizontal">{t("list.directionHorizontal")}</option>
                  <option value="grid">{t("list.directionGrid")}</option>
                </select>
              </label>

              {layout.direction === "grid" && (
                <div className="flex flex-col gap-1.5">
                  <span className={ctlLabel}>{t("list.columns")}</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["columns", "list.screenDesktop", 2],
                        ["columnsTablet", "list.screenTablet", undefined],
                        ["columnsMobile", "list.screenMobile", undefined],
                      ] as const
                    ).map(([key, labelKey, fallback]) => (
                      <label key={key} className="flex flex-col gap-1">
                        <span className="text-[11px] text-foreground-muted">{t(labelKey)}</span>
                        <NumberInput
                          min={1}
                          className={ctlInput}
                          value={layout[key]}
                          placeholder={String(fallback ?? layout.columns ?? 2)}
                          ariaLabel={t(labelKey)}
                          onValue={(v) =>
                            emitSource({ [key]: v == null ? undefined : Math.max(1, Math.floor(v)) })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <span className="text-xs text-foreground-muted">{t("list.columnsHint")}</span>
                </div>
              )}

              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>{t("list.gap")}</span>
                <UnitNumberInput
                  value={layout.gap}
                  unit={layout.gapUnit ?? "px"}
                  placeholder="0"
                  ariaLabel={t("list.gap")}
                  onValue={(v) => emitSource({ gap: v == null ? undefined : Math.max(0, v) })}
                  onUnit={(u) => emitSource({ gapUnit: u })}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>
                  {layout.direction === "horizontal" ? t("list.maxWidth") : t("list.maxHeight")}
                </span>
                <UnitNumberInput
                  value={layout.maxSize}
                  unit={layout.maxSizeUnit ?? "px"}
                  min={1}
                  placeholder={t("list.maxSizePlaceholder")}
                  ariaLabel={t("list.maxSize")}
                  onValue={(v) => emitSource({ maxSize: v ?? undefined })}
                  onUnit={(u) => emitSource({ maxSizeUnit: u })}
                />
                <span className="text-xs text-foreground-muted">{t("list.maxSizeHint")}</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={layout.autoscroll === true}
                  aria-label={t("list.autoscroll")}
                  onChange={(e) => emitSource({ autoscroll: e.target.checked || undefined })}
                />
                <span className={ctlLabel}>{t("list.autoscroll")}</span>
              </label>

              {layout.autoscroll === true && (
                <label className="flex flex-col gap-1.5">
                  <span className={ctlLabel}>{t("list.autoscrollSpeed")}</span>
                  <select
                    className={ctlInput}
                    value={layout.autoscrollSpeed ?? "normal"}
                    aria-label={t("list.autoscrollSpeed")}
                    onChange={(e) =>
                      emitSource({ autoscrollSpeed: e.target.value as "slow" | "normal" | "fast" })
                    }
                  >
                    <option value="slow">{t("list.speedSlow")}</option>
                    <option value="normal">{t("list.speedNormal")}</option>
                    <option value="fast">{t("list.speedFast")}</option>
                  </select>
                </label>
              )}

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={layout.itemList === true}
                  aria-label={t("list.itemList")}
                  onChange={(e) => emitSource({ itemList: e.target.checked || undefined })}
                />
                <span className={ctlLabel}>{t("list.itemList")}</span>
              </label>
              <span className="text-xs text-foreground-muted">{t("list.itemListHint")}</span>
            </div>
          )}

          {/* Combobox config — rides on this same panel. */}
          {templateName && presentation === "combobox" && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>{t("list.cbSelection")}</span>
                <select
                  className={ctlInput}
                  value={cb.select ?? "multiple"}
                  aria-label={t("list.cbSelectionAria")}
                  onChange={(e) => emitSource({ select: e.target.value as "single" | "multiple" })}
                >
                  <option value="multiple">{t("list.cbMultiple")}</option>
                  <option value="single">{t("list.cbSingle")}</option>
                </select>
              </label>
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className={ctlLabel}>{t("list.cbMin")}</span>
                  <NumberInput
                    min={0}
                    className={ctlInput}
                    value={cb.min}
                    placeholder="0"
                    ariaLabel={t("list.cbMinAria")}
                    onValue={(v) => emitSource({ min: v })}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className={ctlLabel}>{t("list.cbMax")}</span>
                  <NumberInput
                    min={0}
                    className={ctlInput}
                    value={cb.max}
                    placeholder="0"
                    ariaLabel={t("list.cbMaxAria")}
                    onValue={(v) => emitSource({ max: v })}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={cb.searchable !== false}
                  aria-label={t("list.cbSearchable")}
                  onChange={(e) => emitSource({ searchable: e.target.checked })}
                />
                {t("list.cbSearchable")}
              </label>
              {/* api kind: identity/label are response DOT-PATHS (free text +
                  sample suggestions); collection kind keeps the column selects. */}
              {kind === "api" ? (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className={ctlLabel}>{t("list.cbValueField")}</span>
                    <input
                      type="text"
                      list={`list-paths-${block.id}`}
                      className={`${ctlInput} font-mono`}
                      value={cb.valueField ?? ""}
                      placeholder={t("bind.pathPlaceholder")}
                      aria-label={t("list.cbValueFieldAria")}
                      onChange={(e) => emitSource({ valueField: e.target.value || undefined })}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className={ctlLabel}>{t("list.cbLabelField")}</span>
                    <input
                      type="text"
                      list={`list-paths-${block.id}`}
                      className={`${ctlInput} font-mono`}
                      value={cb.labelField ?? ""}
                      placeholder={t("bind.pathPlaceholder")}
                      aria-label={t("list.cbLabelFieldAria")}
                      onChange={(e) => emitSource({ labelField: e.target.value || undefined })}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className={ctlLabel}>{t("list.cbValueField")}</span>
                    <select
                      className={ctlInput}
                      value={cb.valueField ?? ""}
                      aria-label={t("list.cbValueFieldAria")}
                      onChange={(e) => emitSource({ valueField: e.target.value || undefined })}
                    >
                      <option value="">{t("list.cbValueDefault")}</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className={ctlLabel}>{t("list.cbLabelField")}</span>
                    <select
                      className={ctlInput}
                      value={cb.labelField ?? ""}
                      aria-label={t("list.cbLabelFieldAria")}
                      onChange={(e) => emitSource({ labelField: e.target.value || undefined })}
                    >
                      <option value="">{t("list.cbLabelDefault")}</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>{t("list.cbLabelExpr")}</span>
                <input
                  type="text"
                  className={`${ctlInput} font-mono`}
                  value={cb.labelExpr ?? ""}
                  placeholder={"${name} · ★ ${rating}"}
                  aria-label={t("list.cbLabelExprAria")}
                  onChange={(e) => emitSource({ labelExpr: e.target.value || undefined })}
                />
                <span className="text-xs text-foreground-muted">
                  {/* ${…} snippets are ICU values, not message text — literal braces crash next-intl. */}
                  {t("list.cbLabelExprHelp", { syntax: "${field}", example: "${name} · ${location}" })}
                </span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>{t("list.cbFieldName")}</span>
                <input
                  type="text"
                  className={ctlInput}
                  value={cb.name ?? ""}
                  placeholder="selection"
                  aria-label={t("list.cbFieldName")}
                  onChange={(e) => emitSource({ name: e.target.value || undefined })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={ctlLabel}>{t("list.cbPlaceholder")}</span>
                <input
                  type="text"
                  className={ctlInput}
                  value={cb.placeholder ?? ""}
                  placeholder={t("list.cbPlaceholderDefault")}
                  aria-label={t("list.cbPlaceholder")}
                  onChange={(e) => emitSource({ placeholder: e.target.value || undefined })}
                />
              </label>
            </div>
          )}

          {/* Field map — the row→item-component binding, used in BOTH presentations.
              api kind maps DOT-PATHS (free text + sample suggestions). */}
          {templateName &&
            (kind === "api" ? (
              <DotPathMap
                label={t("list.map")}
                declared={templateProps}
                map={listMap}
                suggestions={apiPaths}
                datalistId={`list-paths-${block.id}`}
                onChange={(m) => onChange({ listMap: m })}
              />
            ) : (
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
            ))}
        </>
      )}
    </section>
  );
}

/**
 * Form block settings (external-data-sources Form slice (b)): pick where the
 * submission goes — an api SAVED REQUEST (central fetch engine; secret stays
 * server-side) or an opted-in COLLECTION (visitor submissions land as DRAFT
 * items) — via the same source picker binds use. There is deliberately NO
 * field→placeholder map config: the submit endpoint matches form fields by
 * NAME (submit-core), so the panel instead SHOWS the exact input names the
 * form's content must use. Success/error messages + an optional same-site
 * redirect ride on `formTarget`. The content component is set like the List
 * template (single child by name); an AI-authored multi-child form shows its
 * children read-only instead so the select can't clobber them.
 */
export function FormSettings({
  block,
  collections,
  apiSources,
  propsSchemas,
  onChange,
  onProps,
}: {
  block: Block;
  collections: CollectionMeta[];
  apiSources: ApiSourceMeta[];
  propsSchemas: Record<string, string | null>;
  onChange: (patch: { formTarget?: FormTarget; __child?: Block[] }) => void;
  onProps: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const target = block.formTarget;
  const kind = target?.kind;
  const collection = target?.collection ?? "";
  const meta = collections.find((c) => c.tableName === collection);
  const apiSourceId = target?.sourceId ?? "";
  const apiRequestId = target?.requestId ?? "";
  const apiSource = apiSources.find((s) => s.id === apiSourceId);
  const apiRequest = apiSource?.requests.find((r) => r.id === apiRequestId);

  // Form content = the block's children. v1 mirrors the List template: ONE
  // component picked by name. Multiple children (AI-authored) → read-only list.
  const children = block.children ?? [];
  const contentName = children[0]?.component ?? "";
  const componentNames = Object.keys(propsSchemas).sort();

  // The input NAMES the form's fields must use — submit maps by exact name:
  // api = the saved request's {placeholders}; collection = its schema fields.
  const fieldNames =
    kind === "api"
      ? placeholdersOf(apiRequest)
      : kind === "collection"
        ? (meta?.fields ?? []).map((f) => f.name)
        : [];

  const redirect = target?.redirect ?? "";
  const redirectInvalid = redirect !== "" && (!redirect.startsWith("/") || redirect.startsWith("//"));

  /**
   * Rebuild the target from parts. Kind-switching is destructure-based like
   * bind_form: switching drops the OTHER kind's ids; authored messages +
   * redirect always survive. No kind → untargeted (key deleted, the Form
   * renders as a plain container — graceful by design).
   */
  function emit(next: Partial<FormTarget>) {
    const merged = { ...target, ...next };
    if (!merged.kind) {
      onChange({ formTarget: undefined });
      return;
    }
    const built: FormTarget =
      merged.kind === "api"
        ? { kind: "api", sourceId: merged.sourceId, requestId: merged.requestId }
        : { kind: "collection", collection: merged.collection };
    if (merged.successMessage) built.successMessage = merged.successMessage;
    if (merged.errorMessage) built.errorMessage = merged.errorMessage;
    if (merged.redirect) built.redirect = merged.redirect;
    onChange({ formTarget: built });
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{t("form.title")}</h3>
      <SpacingControls props={block.props ?? {}} onPatch={onProps} />
      <p className="text-xs text-foreground-muted">{t("form.help")}</p>

      <SourceSelect
        value={
          kind === "api"
            ? apiSourceId
              ? `${API_PREFIX}${apiSourceId}`
              : ""
            : kind === "collection" && collection
              ? `${COLLECTION_PREFIX}${collection}`
              : ""
        }
        collections={collections}
        apiSources={apiSources}
        onPick={(v) => {
          if (!v) onChange({ formTarget: undefined });
          else if (v.startsWith(COLLECTION_PREFIX))
            emit({ kind: "collection", collection: v.slice(COLLECTION_PREFIX.length) });
          else {
            const id = v.slice(API_PREFIX.length);
            const s = apiSources.find((x) => x.id === id);
            emit({ kind: "api", sourceId: id, requestId: s?.requests[0]?.id ?? "" });
          }
        }}
      />

      {collections.length === 0 && apiSources.length === 0 && (
        <p className="text-xs text-foreground-muted">{t("bind.noSources")}</p>
      )}

      {kind === "api" && apiSourceId && (
        <RequestSelect
          source={apiSource}
          requestId={apiRequestId}
          onPick={(id) => emit({ requestId: id })}
        />
      )}

      {/* Collection opt-in guard: submissions 403 until the flag is ON. */}
      {kind === "collection" && meta && meta.publicSubmissions !== true && (
        <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-xs text-danger">
          {t("form.publicOff")}{" "}
          {/* ponytail: plain <a> (not next/link) — keeps this panel bundleable by
              the dep-free ssr-bind-panel-check script; full reload is fine here. */}
          <a href="/admin/collections" className="underline">
            {t("form.publicOffLink")}
          </a>
        </p>
      )}

      {/* The exact input names the form's content must use (mapping is BY NAME). */}
      {(kind === "api" ? Boolean(apiRequest) : kind === "collection" && Boolean(meta)) && (
        <div className="space-y-1.5">
          <span className={ctlLabel}>{t("form.fields")}</span>
          <p className="text-xs text-foreground-muted">
            {kind === "api" ? t("form.fieldsHelpApi") : t("form.fieldsHelpCollection")}
          </p>
          {fieldNames.length === 0 ? (
            <p className="text-xs text-foreground-muted">{t("form.fieldsNone")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {fieldNames.map((n) => (
                <li
                  key={n}
                  className="rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-xs text-foreground"
                >
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Form content — a component whose inputs (+ its type="submit" button)
          become the form's fields, via native <form> semantics. */}
      {children.length > 1 ? (
        <div className="space-y-1.5 border-t border-border pt-4">
          <span className={ctlLabel}>{t("form.contentMulti")}</span>
          <ul className="space-y-1">
            {children.map((c) => (
              <li key={c.id} className="font-mono text-xs text-foreground">
                {c.component}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 border-t border-border pt-4">
          <span className={ctlLabel}>{t("form.content")}</span>
          <select
            className={ctlInput}
            value={contentName}
            aria-label={t("form.content")}
            onChange={(e) => {
              const name = e.target.value;
              onChange({
                __child: name ? [{ id: `${block.id}-content`, component: name }] : [],
              });
            }}
          >
            <option value="">{t("list.pickTemplate")}</option>
            {componentNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-xs text-foreground-muted">{t("form.contentHelp")}</span>
        </label>
      )}

      {kind && (
        <div className="space-y-3 border-t border-border pt-4">
          <label className="flex flex-col gap-1.5">
            <span className={ctlLabel}>{t("form.successMessage")}</span>
            <input
              type="text"
              className={ctlInput}
              value={target?.successMessage ?? ""}
              placeholder={FORM_DEFAULT_SUCCESS}
              aria-label={t("form.successMessage")}
              onChange={(e) => emit({ successMessage: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={ctlLabel}>{t("form.errorMessage")}</span>
            <input
              type="text"
              className={ctlInput}
              value={target?.errorMessage ?? ""}
              placeholder={FORM_DEFAULT_ERROR}
              aria-label={t("form.errorMessage")}
              onChange={(e) => emit({ errorMessage: e.target.value })}
            />
          </label>
          <p className="text-xs text-foreground-muted">{t("form.messagesHelp")}</p>
          <label className="flex flex-col gap-1.5">
            <span className={ctlLabel}>{t("form.redirect")}</span>
            <input
              type="text"
              className={`${ctlInput} font-mono`}
              value={redirect}
              placeholder="/thank-you"
              aria-label={t("form.redirect")}
              onChange={(e) => emit({ redirect: e.target.value })}
            />
            <span className="text-xs text-foreground-muted">{t("form.redirectHint")}</span>
            {redirectInvalid && (
              <span role="alert" className="text-xs text-danger">
                {t("form.redirectInvalid")}
              </span>
            )}
          </label>
        </div>
      )}
    </section>
  );
}
