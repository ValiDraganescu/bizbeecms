import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Status badge / pill. Tone maps to a purpose token; the badge always carries a
 * visible label and (for status tones) a leading glyph, so meaning is never
 * conveyed by color alone — the No Color-Only State Rule from DESIGN.md.
 *
 * Tones:
 *  - neutral  — counts, generic tags
 *  - primary  — the current / selected thing
 *  - success  — live / healthy
 *  - warning  — needs attention
 *  - danger   — failed / error
 *  - info     — pending / informational
 */
export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

type Variant = "subtle" | "solid" | "outline";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  variant?: Variant;
  /** Render a leading status dot. On by default for status tones. */
  dot?: boolean;
  /** Custom leading glyph (e.g. an icon). Overrides `dot`. */
  icon?: ReactNode;
};

const base =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs " +
  "font-medium whitespace-nowrap align-middle";

const subtle: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-foreground-muted border border-border",
  primary: "bg-primary-subtle text-primary",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  info: "bg-info-subtle text-info",
};

const solid: Record<BadgeTone, string> = {
  neutral: "bg-foreground-muted text-surface",
  primary: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-danger text-danger-foreground",
  info: "bg-info text-info-foreground",
};

const outline: Record<BadgeTone, string> = {
  neutral: "border border-border text-foreground-muted",
  primary: "border border-primary text-primary",
  success: "border border-success text-success",
  warning: "border border-warning text-warning",
  danger: "border border-danger text-danger",
  info: "border border-info text-info",
};

const dotColor: Record<BadgeTone, string> = {
  neutral: "bg-foreground-muted",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

const STATUS_TONES: BadgeTone[] = [
  "success",
  "warning",
  "danger",
  "info",
  "primary",
];

export function Badge({
  tone = "neutral",
  variant = "subtle",
  dot,
  icon,
  className,
  children,
  ...props
}: BadgeProps) {
  const palette =
    variant === "solid" ? solid : variant === "outline" ? outline : subtle;
  // Status tones default to showing a dot so they read without relying on color.
  const showDot = (dot ?? STATUS_TONES.includes(tone)) && !icon;

  return (
    <span className={cn(base, palette[tone], className)} {...props}>
      {icon}
      {showDot ? (
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            variant === "solid" ? "bg-current opacity-80" : dotColor[tone],
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
