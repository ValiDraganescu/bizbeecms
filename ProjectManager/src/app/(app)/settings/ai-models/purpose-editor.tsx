"use client";

import { useTranslations } from "next-intl";
import { Button, Field, FieldHint, FieldLabel, Input } from "@/components/ui";
import type { AiPurpose, CuratedModel } from "@/lib/ai/curated";

/** Shared datalist of OpenRouter model ids; rendered once by the parent form. */
export const MODEL_IDS_DATALIST = "openrouter-model-ids";

/**
 * One purpose's ordered alias list. Order is the preference order — the FIRST
 * entry is that purpose's default, which is why reordering is a first-class
 * control here. The alias key is shown read-only: Sites store it, so it can
 * never change after creation.
 */
export function PurposeEditor({
  purpose,
  models,
  onChange,
  onAdd,
}: {
  purpose: AiPurpose;
  models: CuratedModel[];
  onChange: (models: CuratedModel[]) => void;
  onAdd: () => void;
}) {
  const t = useTranslations("settings.aiModels");

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
      ) : null}

      {models.map((entry, index) => (
        <div
          key={entry.key}
          className="flex flex-col gap-3 rounded-md bg-surface-muted p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-foreground-muted">
              {entry.key}
              {index === 0 ? ` · ${t("defaultBadge")}` : ""}
            </span>
            <div className="flex items-center gap-1">
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

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field>
              <FieldLabel htmlFor={`${purpose}-${entry.key}-label`}>{t("labelField")}</FieldLabel>
              <Input
                id={`${purpose}-${entry.key}-label`}
                value={entry.label}
                onChange={(e) => patch(index, { label: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${purpose}-${entry.key}-model`}>{t("modelField")}</FieldLabel>
              <Input
                id={`${purpose}-${entry.key}-model`}
                list={MODEL_IDS_DATALIST}
                value={entry.model}
                onChange={(e) => patch(index, { model: e.target.value })}
                placeholder="openai/gpt-4o-mini"
                className="font-mono text-sm"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${purpose}-${entry.key}-margin`}>{t("marginField")}</FieldLabel>
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
                className="w-24 font-mono text-sm"
              />
            </Field>
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
