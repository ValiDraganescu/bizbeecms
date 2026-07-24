"use client";

/**
 * Single-item binding panel for a NORMAL component block (Slice C; split out of
 * the former monolithic binding-panels.tsx). Authors ONE binding (key `"item"`):
 * a collection + first-match query (filter/sort) + a map of
 * `declaredProp → collectionField`. Writing an empty map clears the binding (the
 * block reverts to its static props). The renderer picks the first matching row
 * and overwrites the mapped props; unresolved → graceful blank.
 *
 * external-data-sources Slice 5: the source picker lists Collections AND API
 * data sources (same select, two optgroups). An api-kind source swaps the
 * query builder for: saved-request picker + `{placeholder}` param passing
 * (literal or block prop) + dot-path field maps, with a "load sample" button
 * (the Slice-4 test endpoint) that feeds a <datalist> of suggested paths.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Block, BindingRef, ApiBindingParams } from "@/lib/render/tree";
import { firstBinding } from "@/lib/content/binding";
import {
  collectionColumns,
  type ApiSourceMeta,
  type CollectionMeta,
  type FilterClause,
  type SortClause,
} from "@/lib/page-builder/types";
import { ctlLabel, ctlInput } from "./shared";
import {
  API_PREFIX,
  COLLECTION_PREFIX,
  ApiParamsEditor,
  DotPathMap,
  QueryBuilder,
  RequestSelect,
  SampleLoader,
  SourceSelect,
  placeholdersOf,
} from "./binding-controls";

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
