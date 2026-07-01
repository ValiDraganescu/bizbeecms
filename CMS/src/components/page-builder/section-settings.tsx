"use client";

import { useTranslations } from "next-intl";
import type { Block } from "@/lib/render/tree";

/**
 * Right-rail Block tab when a Section is selected — the visual settings panel
 * (columns, empty-col behavior, alignment, padding with a shared rem/px unit,
 * gap, max-width, theme-palette background). Edits the Section's `props` via the
 * parent's `mergeSectionProps`; the existing top-bar Save persists. All editing
 * is PURE prop merges — no store.
 *
 * Background swatches are SITE THEME purpose tokens (`var(--color-*)`), not hex,
 * so they resolve light/dark at render.
 */
export function SectionSettings({
  section,
  onChange,
}: {
  section: Block;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const p = (section.props ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
  const s = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);

  const vAlign = s(p.verticalAlign, "top");
  const hAlign = s(p.horizontalAlign, "left");
  const maxWidth = s(p.maxWidth, "1280px");
  const bg = s(p.backgroundColor, "transparent");
  // ONE shared padding unit for all four sides (migrate any legacy per-side unit:
  // use Top's, default rem) — mirrors tree.ts planSection.
  const paddingUnit = s(p.paddingUnit, s(p.paddingTopUnit, "rem"));

  const label = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
  const seg =
    "flex-1 rounded-md border px-2 py-1 text-sm transition-colors";
  const segOn = "border-primary bg-primary-subtle text-foreground font-medium";
  const segOff = "border-border text-foreground-muted hover:text-foreground";

  // Background swatches reuse the design-system purpose tokens (theme palette).
  const swatches: { value: string; key: string }[] = [
    { value: "transparent", key: "bgNone" },
    { value: "var(--color-surface)", key: "bgSurface" },
    { value: "var(--color-surface-raised)", key: "bgRaised" },
    { value: "var(--color-surface-muted)", key: "bgMuted" },
    { value: "var(--color-primary)", key: "bgPrimary" },
    { value: "var(--color-primary-subtle)", key: "bgPrimarySubtle" },
    { value: "var(--color-foreground)", key: "bgForeground" },
  ];

  const sides: ("Top" | "Right" | "Bottom" | "Left")[] = ["Top", "Right", "Bottom", "Left"];
  const aligns: { v: string; h: string }[] = [
    { v: "top", h: "left" }, { v: "top", h: "center" }, { v: "top", h: "right" },
    { v: "center", h: "left" }, { v: "center", h: "center" }, { v: "center", h: "right" },
    { v: "bottom", h: "left" }, { v: "bottom", h: "center" }, { v: "bottom", h: "right" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-medium text-foreground">{t("sectionSettings")}</h3>

      <p className="text-xs text-foreground-muted">{t("sectionRowsHint")}</p>

      {/* Content alignment (vertical × horizontal) */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionAlign")}</span>
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
      </div>

      {/* Padding — one number input per side, sharing ONE rem/px unit switch */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className={label}>{t("sectionPadding")}</span>
          {/* single unit switch governing all four sides; clears legacy per-side units */}
          <div className="flex overflow-hidden rounded-md border border-border">
            {(["rem", "px"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() =>
                  onChange({
                    paddingUnit: u,
                    paddingTopUnit: undefined,
                    paddingRightUnit: undefined,
                    paddingBottomUnit: undefined,
                    paddingLeftUnit: undefined,
                  })
                }
                aria-pressed={paddingUnit === u}
                className={`px-2 py-0.5 text-xs transition-colors ${
                  paddingUnit === u
                    ? "bg-primary-subtle font-medium text-foreground"
                    : "bg-surface-muted text-foreground-muted hover:text-foreground"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {sides.map((side) => (
            <label key={side} className="flex flex-col gap-1">
              <span className="text-[11px] text-foreground-muted">
                {t(`sectionSide.${side.toLowerCase()}`)}
              </span>
              <input
                type="number"
                min={0}
                value={num(p[`padding${side}`], 0)}
                onChange={(e) => onChange({ [`padding${side}`]: +e.target.value })}
                className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none"
                aria-label={`${t("sectionPadding")} ${side}`}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Gap */}
      <label className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionGap")}</span>
        <input
          type="number"
          min={0}
          value={num(p.gap, 16)}
          onChange={(e) => onChange({ gap: +e.target.value })}
          className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none"
        />
      </label>

      {/* Max width */}
      <label className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionMaxWidth")}</span>
        <select
          value={maxWidth}
          onChange={(e) => onChange({ maxWidth: e.target.value })}
          className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none"
        >
          {["960px", "1024px", "1152px", "1280px", "1440px"].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
          <option value="full">{t("sectionMaxWidthFull")}</option>
        </select>
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
    </div>
  );
}
