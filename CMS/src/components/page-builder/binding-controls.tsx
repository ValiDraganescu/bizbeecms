"use client";

/**
 * Shared authoring CONTROLS for the binding panels (split out of the former
 * monolithic binding-panels.tsx; the panels themselves live in
 * binding-panel.tsx / list-settings.tsx / form-settings.tsx and re-export
 * through the binding-panels.tsx barrel):
 *
 *  - `SourceSelect`   — the combined Collections + API sources picker (one
 *    select, two optgroups; option values encode the kind via the prefixes).
 *  - `RequestSelect`  — saved-request picker for a chosen api source.
 *  - `ApiParamsEditor`— per-`{placeholder}` literal/prop param editor.
 *  - `SampleLoader`   — "load sample response" through the Slice-4 test
 *    endpoint, feeding dot-path suggestions back to the panel.
 *  - `DotPathMap`     — prop → dot-path map editor with datalist hints.
 *  - `QueryBuilder`   — reusable filter[] + sort[] editor over collection columns.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ApiBindingParams } from "@/lib/render/tree";
import { requestPlaceholders } from "@/lib/data-sources/validate";
import { samplePaths } from "@/lib/data-sources/bind";
import {
  FILTER_OPS,
  type ApiRequestMeta,
  type ApiSourceMeta,
  type CollectionMeta,
  type FilterClause,
  type SortClause,
} from "@/lib/page-builder/types";
import { ctlLabel, ctlInput } from "./shared";

// The combined source <select> encodes kind in the option value.
export const COLLECTION_PREFIX = "c:";
export const API_PREFIX = "a:";

/**
 * Per-`{placeholder}` param editor for an api-kind source: each placeholder is
 * a literal text value or (when the block declares props) read from a prop at
 * render time — the Slice-3 hydration resolves `{ prop }` specs.
 */
export function ApiParamsEditor({
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
export function SampleLoader({
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
export function DotPathMap({
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
export function SourceSelect({
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
export function RequestSelect({
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
export function placeholdersOf(request: ApiRequestMeta | undefined): string[] {
  return request ? requestPlaceholders(request) : [];
}

/**
 * A reusable filter[] + sort[] editor over a collection's columns. PURE-ish
 * (controlled): emits new arrays via `onChange`. `is_null`/`not_null` take no
 * value. Used by both the single-item BindingPanel and the List query.
 */
export function QueryBuilder({
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
