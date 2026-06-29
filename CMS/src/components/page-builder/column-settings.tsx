"use client";

import { useTranslations } from "next-intl";
import type { Block } from "@/lib/render/tree";

/**
 * Per-column settings panel (right-rail Block tab when a column shell is
 * selected). Today it holds per-viewport VISIBILITY, content alignment override,
 * padding/margin (per-side rem/px), gap and a theme-palette background. Storage
 * is per-column props; the renderer (tree.ts) maps them to classes/inline style.
 *
 * Background swatches are SITE THEME purpose tokens (`var(--color-*)`), not hex,
 * so they resolve light/dark at render. Padding has a rem/px unit toggle per side.
 */
export function ColumnSettings({
  column,
  onChange,
}: {
  column: Block;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const p = (column.props ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
  const s = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
  const label = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
  const seg = "flex-1 rounded-md border px-2 py-1 text-sm transition-colors";
  const segOn = "border-primary bg-primary-subtle text-foreground font-medium";
  const segOff = "border-border text-foreground-muted hover:text-foreground";

  const viewports: { key: "hideMobile" | "hideTablet" | "hideDesktop"; label: string }[] = [
    { key: "hideMobile", label: t("colVisibility.mobile") },
    { key: "hideTablet", label: t("colVisibility.tablet") },
    { key: "hideDesktop", label: t("colVisibility.desktop") },
  ];

  // alignment is an OVERRIDE of the Section default: vAlign/hAlign absent =
  // inherit. The "inherit" cell (no override) clears both props.
  const vAlign = p.verticalAlign != null ? s(p.verticalAlign, "top") : null;
  const hAlign = p.horizontalAlign != null ? s(p.horizontalAlign, "left") : null;
  const sides: ("Top" | "Right" | "Bottom" | "Left")[] = ["Top", "Right", "Bottom", "Left"];
  const aligns: { v: string; h: string }[] = [
    { v: "top", h: "left" }, { v: "top", h: "center" }, { v: "top", h: "right" },
    { v: "center", h: "left" }, { v: "center", h: "center" }, { v: "center", h: "right" },
    { v: "bottom", h: "left" }, { v: "bottom", h: "center" }, { v: "bottom", h: "right" },
  ];
  // Background swatches reuse the design-system purpose tokens (theme palette) so
  // they resolve light/dark at render — same set as SectionSettings.
  const bg = s(p.backgroundColor, "transparent");
  const swatches: { value: string; key: string }[] = [
    { value: "transparent", key: "bgNone" },
    { value: "var(--color-surface)", key: "bgSurface" },
    { value: "var(--color-surface-raised)", key: "bgRaised" },
    { value: "var(--color-surface-muted)", key: "bgMuted" },
    { value: "var(--color-primary)", key: "bgPrimary" },
    { value: "var(--color-primary-subtle)", key: "bgPrimarySubtle" },
    { value: "var(--color-foreground)", key: "bgForeground" },
  ];

  // padding/margin: one number input + per-side rem/px unit toggle (rem default).
  const spacing = (kind: "padding" | "margin") => (
    <div className="flex flex-col gap-1.5">
      <span className={label}>{t(kind === "padding" ? "sectionPadding" : "columnMargin")}</span>
      <div className="grid grid-cols-2 gap-2">
        {sides.map((side) => {
          const unit = s(p[`${kind}${side}Unit`], "rem");
          return (
            <label key={side} className="flex flex-col gap-1">
              <span className="text-[11px] text-foreground-muted">
                {t(`sectionSide.${side.toLowerCase()}`)}
              </span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-border">
                <input
                  type="number"
                  min={0}
                  value={num(p[`${kind}${side}`], 0)}
                  onChange={(e) => onChange({ [`${kind}${side}`]: +e.target.value })}
                  className="w-full bg-surface px-2 py-1 text-sm text-foreground outline-none"
                  aria-label={`${kind} ${side}`}
                />
                <button
                  type="button"
                  onClick={() => onChange({ [`${kind}${side}Unit`]: unit === "rem" ? "px" : "rem" })}
                  className="border-l border-border bg-surface-muted px-2 text-xs text-foreground-muted hover:text-foreground"
                  aria-label={`${kind} ${side} unit: ${unit}`}
                >
                  {unit}
                </button>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-medium text-foreground">{t("columnSettings")}</h3>

      {/* Content alignment — overrides the Section default for THIS column */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("columnAlign")}</span>
        <p className="text-[11px] text-foreground-muted">{t("columnAlignHint")}</p>
        <div className="flex items-start gap-2">
          <div className="grid w-[84px] grid-cols-3 gap-0.5">
            {aligns.map(({ v, h }) => {
              const on = vAlign === v && hAlign === h;
              return (
                <button
                  key={`${v}-${h}`}
                  type="button"
                  onClick={() => onChange({ verticalAlign: v, horizontalAlign: h })}
                  aria-pressed={on}
                  aria-label={`${v} ${h}`}
                  className={`flex h-6 items-center justify-center rounded-sm border text-xs ${on ? segOn : segOff}`}
                >
                  <span className="block h-1.5 w-1.5 rounded-full bg-current" />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onChange({ verticalAlign: undefined, horizontalAlign: undefined })}
            aria-pressed={vAlign === null && hAlign === null}
            className={`rounded-md border px-2 py-1 text-xs ${vAlign === null && hAlign === null ? segOn : segOff}`}
          >
            {t("columnAlignInherit")}
          </button>
        </div>
      </div>

      {/* Padding */}
      {spacing("padding")}
      {/* Margin */}
      {spacing("margin")}

      {/* Gap between stacked components */}
      <label className="flex flex-col gap-1.5">
        <span className={label}>{t("columnGap")}</span>
        <input
          type="number"
          min={0}
          value={num(p.gap, 0)}
          onChange={(e) => onChange({ gap: +e.target.value })}
          className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none"
        />
      </label>

      {/* Background — theme palette swatches */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionBackground")}</span>
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

      {/* Visibility (existing) */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("colVisibility.label")}</span>
        <p className="text-[11px] text-foreground-muted">{t("colVisibility.hint")}</p>
        <div className="flex gap-1">
          {viewports.map((v) => {
            const hidden = Boolean(p[v.key]);
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => onChange({ [v.key]: !hidden })}
                aria-pressed={hidden}
                className={`${seg} ${hidden ? segOn : segOff}`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
