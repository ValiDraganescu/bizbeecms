"use client";

import { useTranslations } from "next-intl";
import { Button, FieldHint, Input } from "@/components/ui";
import type { AiPurpose, CuratedModel } from "@/lib/ai/curated";
import { PURPOSE_CAPABILITY_FILTERS, pricePerMillion, type CatalogModel } from "@/lib/ai/model-catalog";
import { ModelPicker } from "./model-picker";

// One grid template shared by the header row and every entry row, so the
// columns line up like a table: Label | Model | Margin | actions.
const ROW_GRID =
  "sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_4.5rem_9.5rem]";

/**
 * One purpose's ordered alias list, rendered as a compact table: a header row
 * with the field labels (sm+; below that each cell carries its own label) and
 * one row per alias — inputs, actions, and a small meta line (key, default
 * badge, list prices) underneath. Order is the preference order — the FIRST
 * entry is that purpose's default, which is why reordering is a first-class
 * control here. The alias key is shown read-only: Sites store it, so it can
 * never change after creation.
 */
export function PurposeEditor({
  purpose,
  models,
  catalog,
  onChange,
  onAdd,
}: {
  purpose: AiPurpose;
  models: CuratedModel[];
  /** The OpenRouter catalog, fetched once by the form; empty → free-text. */
  catalog: ReadonlyArray<CatalogModel>;
  onChange: (models: CuratedModel[]) => void;
  onAdd: () => void;
}) {
  const t = useTranslations("settings.aiModels");
  const filters = PURPOSE_CAPABILITY_FILTERS[purpose];

  function patch(index: number, fields: Partial<CuratedModel>) {
    onChange(models.map((m, i) => (i === index ? { ...m, ...fields } : m)));
  }

  function remove(index: number) {
    onChange(models.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= models.length) return;
    const next = [...models];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-foreground">
          {t(`purposes.${purpose}.title`)}
        </h2>
        <p className="text-xs text-foreground-muted">
          {t(`purposes.${purpose}.description`)}
        </p>
      </div>

      {models.length === 0 ? (
        <p className="text-xs text-foreground-muted">{t("empty")}</p>
      ) : (
        <div className={`hidden gap-3 px-3 sm:grid ${ROW_GRID}`}>
          <span className="text-xs font-medium text-foreground-muted">
            {t("labelField")}
          </span>
          <span className="text-xs font-medium text-foreground-muted">
            {t("modelField")}
          </span>
          <span className="text-xs font-medium text-foreground-muted">
            {t("marginField")}
          </span>
          <span aria-hidden="true" />
        </div>
      )}

      {models.map((entry, index) => (
        <div
          key={entry.key}
          className="flex flex-col gap-1.5 rounded-md bg-surface-muted p-3"
        >
          <div className={`grid gap-3 sm:items-center ${ROW_GRID}`}>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${purpose}-${entry.key}-label`}
                className="text-xs font-medium text-foreground sm:hidden"
              >
                {t("labelField")}
              </label>
              <Input
                id={`${purpose}-${entry.key}-label`}
                value={entry.label}
                onChange={(e) => patch(index, { label: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${purpose}-${entry.key}-model`}
                className="text-xs font-medium text-foreground sm:hidden"
              >
                {t("modelField")}
              </label>
              {catalog.length > 0 ? (
                <ModelPicker
                  id={`${purpose}-${entry.key}-model`}
                  value={entry.model}
                  onChange={(model) => patch(index, { model })}
                  models={catalog}
                  requireModalities={filters.input}
                  requireOutputModalities={filters.output}
                />
              ) : (
                // Catalog fetch failed → plain free-text entry still works.
                <Input
                  id={`${purpose}-${entry.key}-model`}
                  value={entry.model}
                  onChange={(e) => patch(index, { model: e.target.value })}
                  placeholder="openai/gpt-4o-mini"
                  className="font-mono text-sm"
                />
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${purpose}-${entry.key}-margin`}
                className="text-xs font-medium text-foreground sm:hidden"
              >
                {t("marginField")}
              </label>
              <Input
                id={`${purpose}-${entry.key}-margin`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={String(entry.marginPct)}
                onChange={(e) => {
                  // A cleared field is 0, not NaN — the input must never render
                  // "NaN" back at the operator.
                  const n = Number(e.target.value);
                  patch(index, { marginPct: Number.isFinite(n) && n >= 0 ? n : 0 });
                }}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-1 sm:justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={t("moveUp")}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => move(index, 1)}
                disabled={index === models.length - 1}
                aria-label={t("moveDown")}
              >
                ↓
              </Button>
              <Button size="sm" variant="danger" onClick={() => remove(index)}>
                {t("remove")}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-xs text-foreground-muted">
              {entry.key}
              {index === 0 ? ` · ${t("defaultBadge")}` : ""}
            </span>
            <PriceStrip model={catalog.find((m) => m.id === entry.model)} t={t} />
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" onClick={onAdd} className="w-fit">
          {t("add")}
        </Button>
        <FieldHint>{t("orderHint")}</FieldHint>
      </div>
    </section>
  );
}

/**
 * OpenRouter's list price for the alias's model, per 1M tokens: input, cached
 * input (cache read), output — and cache write when the provider bills it.
 * The catalog carries no "cached output" price (no provider has one). Nothing
 * rendered when the model isn't in the catalog (free-text id or catalog down).
 */
/** USD per 1M tokens; sub-cent prices keep enough decimals to not read as $0.00. */
function fmtPerMillion(usdPerToken: number): string {
  const perM = usdPerToken * 1_000_000;
  if (perM === 0) return "0.00";
  if (perM < 0.01) return perM.toFixed(4);
  if (perM < 0.1) return perM.toFixed(3);
  return pricePerMillion(usdPerToken) ?? perM.toFixed(2);
}

function PriceStrip({
  model,
  t,
}: {
  model: CatalogModel | undefined;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!model) return null;
  const cell = (label: string, v: number | null) => (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-foreground-muted">{label}</span>
      <span className="font-mono text-foreground">{v == null ? "—" : `$${fmtPerMillion(v)}`}</span>
    </span>
  );
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs"
      title={t("price.title")}
    >
      <span className="text-foreground-muted">{t("price.perMillion")}</span>
      {cell(t("price.input"), model.inputPrice)}
      {cell(t("price.cachedInput"), model.cacheReadPrice)}
      {cell(t("price.output"), model.outputPrice)}
      {model.cacheWritePrice != null ? cell(t("price.cacheWrite"), model.cacheWritePrice) : null}
    </div>
  );
}
