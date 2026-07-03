"use client";

import { useTranslations } from "next-intl";
import type { Block } from "@/lib/render/tree";
import { UnitNumberInput, type SizeUnit } from "./shared";

/**
 * Per-ROW settings panel (right-rail Block tab when a `__section_row__` is
 * selected). Column COUNT lives inline on the row in the Layers tree; this panel
 * holds the row's other renderer-honored props: empty-column behavior, column gap,
 * vertical alignment of the row's columns, a theme-token row background band, and
 * per-side padding. Storage is per-row props (merged via the generic block-prop
 * merge); the renderer (`plan-section.ts` planRowGrid) reads them.
 *
 * Background swatches are SITE THEME purpose tokens (`var(--color-*)`), not hex, so
 * they resolve light/dark at render — same set as Section/Column settings.
 */
export function RowSettings({
  row,
  onChange,
}: {
  row: Block;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const p = (row.props ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
  const s = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
  const label = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
  const seg = "flex-1 rounded-md border px-2 py-1 text-sm transition-colors";
  const segOn = "border-primary bg-primary-subtle text-foreground font-medium";
  const segOff = "border-border text-foreground-muted hover:text-foreground";

  const behavior = s(p.columnBehavior, "equal");
  // vertical align OVERRIDES the section default: absent = inherit.
  const vAlign = p.verticalAlign != null ? s(p.verticalAlign, "top") : null;
  const bg = s(p.backgroundColor, "transparent");
  const sides: ("Top" | "Right" | "Bottom" | "Left")[] = ["Top", "Right", "Bottom", "Left"];

  const swatches: { value: string; key: string }[] = [
    { value: "transparent", key: "bgNone" },
    { value: "var(--color-surface)", key: "bgSurface" },
    { value: "var(--color-surface-raised)", key: "bgRaised" },
    { value: "var(--color-surface-muted)", key: "bgMuted" },
    { value: "var(--color-primary)", key: "bgPrimary" },
    { value: "var(--color-primary-subtle)", key: "bgPrimarySubtle" },
    { value: "var(--color-foreground)", key: "bgForeground" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-medium text-foreground">{t("rowSettings")}</h3>

      {/* Empty columns behavior */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionEmptyCols")}</span>
        <div className="flex gap-1">
          {(["equal", "collapse"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onChange({ columnBehavior: b })}
              aria-pressed={behavior === b}
              className={`${seg} ${behavior === b ? segOn : segOff}`}
            >
              {t(`sectionBehavior.${b}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Vertical alignment of this row's columns (overrides the section default) */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("rowVerticalAlign")}</span>
        <div className="flex gap-1">
          {(["top", "center", "bottom"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ verticalAlign: v })}
              aria-pressed={vAlign === v}
              className={`${seg} ${vAlign === v ? segOn : segOff}`}
            >
              {t(`rowVAlign.${v}`)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({ verticalAlign: undefined })}
            aria-pressed={vAlign === null}
            className={`${seg} ${vAlign === null ? segOn : segOff}`}
          >
            {t("columnAlignInherit")}
          </button>
        </div>
      </div>

      {/* Column gap */}
      <label className="flex w-24 flex-col gap-1.5">
        <span className={label}>{t("sectionGap")}</span>
        <UnitNumberInput
          value={num(p.gap, 16)}
          unit={s(p.gapUnit, "px") as SizeUnit}
          onValue={(v) => onChange({ gap: v ?? 0 })}
          onUnit={(u) => onChange({ gapUnit: u })}
          ariaLabel={t("sectionGap")}
        />
      </label>

      {/* Padding — one number input + per-side rem/px unit toggle */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionPadding")}</span>
        <div className="grid grid-cols-2 gap-2">
          {sides.map((side) => (
            <label key={side} className="flex flex-col gap-1">
              <span className="text-[11px] text-foreground-muted">
                {t(`sectionSide.${side.toLowerCase()}`)}
              </span>
              <UnitNumberInput
                value={num(p[`padding${side}`], 0)}
                unit={s(p[`padding${side}Unit`], "rem") as SizeUnit}
                onValue={(v) => onChange({ [`padding${side}`]: v ?? 0 })}
                onUnit={(u) => onChange({ [`padding${side}Unit`]: u })}
                ariaLabel={`padding ${side}`}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Row background band — theme palette swatches */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("rowBackground")}</span>
        <div className="flex flex-wrap gap-1.5">
          {swatches.map((c) => {
            const on = bg === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => onChange({ backgroundColor: c.value })}
                aria-pressed={on}
                title={t(`sectionSwatch.${c.key}`)}
                aria-label={t(`sectionSwatch.${c.key}`)}
                className={`h-7 w-7 rounded-md border-2 ${on ? "border-primary" : "border-border"}`}
                style={
                  c.value === "transparent"
                    ? { backgroundImage: "linear-gradient(45deg,var(--color-border) 25%,transparent 25%,transparent 75%,var(--color-border) 75%)", backgroundSize: "8px 8px" }
                    : { backgroundColor: c.value }
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
