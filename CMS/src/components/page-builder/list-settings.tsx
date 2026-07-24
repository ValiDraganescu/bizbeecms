"use client";

/**
 * List block settings (Slice C; split out of the former monolithic
 * binding-panels.tsx): pick the source collection + query (filter/sort/limit),
 * pick the per-row TEMPLATE component (set as the List's single child), and map
 * each row field → the template's declared props (`listMap`). Empty/dead query →
 * the renderer shows the empty-state slot (or nothing). The template child is set
 * by component NAME (DnD into a List isn't wired this slice — a select is enough).
 *
 * list-item-translatables: the template's TRANSLATABLE props that are NOT bound
 * to a row field surface as per-locale editors (the same TranslatableField the
 * component inspector uses), stored as locale objects on the TEMPLATE child's
 * props — the renderer's resolveLocalized picks the visitor's locale per row.
 * Binding a prop hides its static editor (row data wins); unbinding restores it
 * with whatever was stored.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Block, ListSource } from "@/lib/render/tree";
import { normalizeLabelExpr } from "@/lib/render/tree";
import { parsePropsSchema, type BlockPropsUpdater } from "@/lib/pages/page-blocks";
import { apiListElements } from "@/lib/data-sources/bind";
import {
  collectionColumns,
  type ApiSourceMeta,
  type CollectionMeta,
  type FilterClause,
  type SortClause,
} from "@/lib/page-builder/types";
import { ctlLabel, ctlInput, SpacingControls, UnitNumberInput } from "./shared";
import { NumberInput } from "@/components/ui/number-input";
import { TranslatableField } from "./translatable-field";
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

export function ListSettings({
  block,
  collections,
  apiSources,
  propsSchemas,
  locales,
  onChange,
  onProps,
  onTemplateProps,
}: {
  block: Block;
  collections: CollectionMeta[];
  apiSources: ApiSourceMeta[];
  propsSchemas: Record<string, string | null>;
  /** Site content locales, default (source) first. */
  locales: string[];
  onChange: (
    patch: Partial<Pick<Block, "listSource" | "listMap">> & { __child?: Block[] },
  ) => void;
  onProps: (patch: Record<string, unknown>) => void;
  /** Write the TEMPLATE child's props through the T7 updater path: sync edits
   *  pass the next props object, async translate results pass an UPDATER run
   *  against the template block's latest props (never a stale snapshot). */
  onTemplateProps: (
    templateId: string,
    props: Record<string, unknown> | BlockPropsUpdater,
  ) => void;
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
  const templateSchema = template ? parsePropsSchema(propsSchemas[template.component]) : [];
  const templateProps = templateSchema.map((f) => f.name);
  const componentNames = Object.keys(propsSchemas).sort();
  // Translatable template props NOT bound to a row field: editable statically,
  // per locale, on the template child (hidden the moment the prop is mapped).
  const staticTranslatables = templateSchema.filter(
    (f) => f.translatable && listMap[f.name] === undefined,
  );

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

          {/* Unbound translatable item props: static per-locale text stored on
              the TEMPLATE child (every row renders it in the visitor's locale).
              A prop disappears from here the moment it's bound above. */}
          {template && staticTranslatables.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              <span className={ctlLabel}>{t("list.translatables")}</span>
              <p className="text-xs text-foreground-muted">{t("list.translatablesHint")}</p>
              {staticTranslatables.map((f) => (
                <TranslatableField
                  key={`${template.id}-${f.name}`}
                  field={f}
                  schema={templateSchema}
                  block={template}
                  props={(template.props ?? {}) as Record<string, unknown>}
                  locales={locales}
                  onChange={(p) => onTemplateProps(template.id, p)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
