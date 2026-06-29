"use client";

/**
 * Shared Page Builder UI atoms: the icon set + small presentational primitives
 * (viewport/theme icons, collapse toggle) and the two reused form-control class
 * strings. Kept tiny and dependency-free so every panel component can import them
 * without pulling in the shell.
 */

import type { Viewport } from "@/lib/page-builder/types";

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
