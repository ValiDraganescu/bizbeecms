"use client";

/**
 * Shared Page Builder UI atoms: the icon set + small presentational primitives
 * (viewport/theme icons, collapse toggle) and the two reused form-control class
 * strings. Kept tiny and dependency-free so every panel component can import them
 * without pulling in the shell.
 */

import { useTranslations } from "next-intl";
import type { Viewport } from "@/lib/page-builder/types";
import { NumberInput } from "@/components/ui/number-input";

export const ICON = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
} as const;

/** Shared control class strings for the binding/list panels. */
export const ctlLabel = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
export const ctlInput =
  "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted";

export type SizeUnit = "rem" | "px";

/**
 * A number input with a rem/px unit toggle — THE control for every sizing value
 * in the builder (rule: all sizing controls of all kinds carry a unit picker).
 * Stored as two props: the number and a companion `<name>Unit`. Pass the
 * renderer's default as `unit` so legacy blocks (no unit prop) show what they
 * actually render as.
 */
export function UnitNumberInput({
  value,
  unit,
  onValue,
  onUnit,
  min = 0,
  placeholder,
  ariaLabel,
}: {
  value: number | undefined;
  unit: SizeUnit;
  onValue: (v: number | undefined) => void;
  onUnit: (u: SizeUnit) => void;
  min?: number;
  placeholder?: string;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-border">
      <NumberInput
        min={min}
        value={value}
        placeholder={placeholder}
        onValue={onValue}
        className="w-full bg-surface px-2 py-1 text-sm text-foreground outline-none"
        ariaLabel={ariaLabel}
      />
      <button
        type="button"
        onClick={() => onUnit(unit === "rem" ? "px" : "rem")}
        className="border-l border-border bg-surface-muted px-2 text-xs text-foreground-muted hover:text-foreground"
        aria-label={`${ariaLabel} unit: ${unit}`}
      >
        {unit}
      </button>
    </div>
  );
}

/**
 * Padding + margin editor (per-side, rem/px) — THE standard spacing control at
 * the top of every block's settings panel (components, List, Form, columns).
 * Patches `padding<Side>`/`margin<Side>` (+ companion `<…>Unit`, rem default)
 * into the block's props; the renderer reads them off the block wrapper
 * (`wrapBlockWidth`) / column shell (`columnStyle`).
 */
export function SpacingControls({
  props,
  onPatch,
}: {
  props: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const sides = ["Top", "Right", "Bottom", "Left"] as const;
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const unit = (v: unknown): SizeUnit => (v === "px" ? "px" : "rem");
  return (
    <>
      {(["padding", "margin"] as const).map((kind) => (
        <div key={kind} className="flex flex-col gap-1.5">
          <span className={ctlLabel}>
            {t(kind === "padding" ? "sectionPadding" : "columnMargin")}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {sides.map((side) => (
              <label key={side} className="flex flex-col gap-1">
                <span className="text-[11px] text-foreground-muted">
                  {t(`sectionSide.${side.toLowerCase()}`)}
                </span>
                <UnitNumberInput
                  value={num(props[`${kind}${side}`])}
                  unit={unit(props[`${kind}${side}Unit`])}
                  placeholder="0"
                  onValue={(v) => onPatch({ [`${kind}${side}`]: v ?? 0 })}
                  onUnit={(u) => onPatch({ [`${kind}${side}Unit`]: u })}
                  ariaLabel={`${kind} ${side}`}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function ViewportIcon({ kind }: { kind: Viewport }) {
  switch (kind) {
    case "desktop":
      return (
        <svg {...ICON}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "tablet":
      return (
        <svg {...ICON}>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="12" y1="18" x2="12" y2="18" />
        </svg>
      );
    case "mobile":
      return (
        <svg {...ICON}>
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
      );
  }
}

/** Preview color-mode toggle icons: sun (light) / monitor (system) / moon (dark). */
export function PreviewThemeIcon({ kind }: { kind: "light" | "system" | "dark" }) {
  switch (kind) {
    case "light":
      return (
        <svg {...ICON} width={14} height={14}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
        </svg>
      );
    case "system":
      return (
        <svg {...ICON} width={14} height={14}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "dark":
      return (
        <svg {...ICON} width={14} height={14}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
  }
}

/**
 * Double-chevron collapse/expand toggle for a side rail (mirrors the admin
 * sidebar's affordance). `side` picks which way the chevrons point when
 * expanded; `collapsed` flips them so the icon always points "toward" the
 * direction the panel will move on click.
 */
export function CollapseToggle({
  side,
  collapsed,
  onClick,
  label,
}: {
  side: "left" | "right";
  collapsed: boolean;
  onClick: () => void;
  label: string;
}) {
  // Expanded: chevrons point toward the rail's outer edge (collapse direction).
  // left rail → point left (◀◀); right rail → point right (▶▶). Collapsed flips.
  const pointsLeft = side === "left" ? !collapsed : collapsed;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex items-center justify-center rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={"transition-transform duration-200 " + (pointsLeft ? "" : "rotate-180")}
      >
        <path d="M11 17l-5-5 5-5" />
        <path d="M18 17l-5-5 5-5" />
      </svg>
    </button>
  );
}
