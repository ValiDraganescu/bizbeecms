import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/components/ui";

/**
 * Presentational scaffolding for the design-system reference page. These are
 * the page's own layout primitives (not part of the shipped component library):
 * a Section wrapper, a Specimen row that labels a single variant, a token
 * Swatch, and a Mono code chip.
 */

/** The id is the scroll-spy anchor target; keep it in sync with the nav. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-24 border-b border-border pb-12 last:border-0"
    >
      <div className="mb-6 flex flex-col gap-1">
        <h2
          id={`${id}-heading`}
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-sm text-foreground-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-8">{children}</div>
    </section>
  );
}

/**
 * A labelled specimen: a caption (what this row demonstrates) above a surface
 * that holds the live component(s). `mono` renders the caption as a code chip
 * (useful for prop values like `variant="ghost"`).
 */
export function Specimen({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        {hint ? (
          <p className="text-xs text-foreground-muted">{hint}</p>
        ) : null}
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-lg border border-border " +
            "bg-surface-raised p-5",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Small caption under a single specimen item, e.g. the state name. */
export function Caption({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("text-xs text-foreground-muted", className)}
      {...props}
    />
  );
}

/** Vertical stack: a specimen item with its caption underneath. */
export function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      {children}
      <Caption>{label}</Caption>
    </div>
  );
}

/** Inline monospace chip for token names / prop values. */
export function Mono({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        "rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs " +
          "text-foreground-muted",
        className,
      )}
      style={{ fontFamily: "var(--font-mono)" }}
      {...props}
    />
  );
}

/** A color-token swatch with its name and the utility class beneath. */
export function Swatch({
  name,
  utility,
  className,
  ring,
}: {
  name: string;
  utility: string;
  /** Tailwind bg utility for the chip, e.g. "bg-primary". */
  className: string;
  /** Add a hairline ring for light fills that would otherwise vanish. */
  ring?: boolean;
}) {
  return (
    <div className="flex w-32 flex-col gap-2">
      <div
        className={cn(
          "h-14 w-full rounded-lg",
          ring ? "ring-1 ring-inset ring-border" : "",
          className,
        )}
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-foreground">{name}</span>
        <Mono>{utility}</Mono>
      </div>
    </div>
  );
}
