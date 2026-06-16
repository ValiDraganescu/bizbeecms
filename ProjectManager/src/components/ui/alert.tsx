import type { HTMLAttributes, ReactNode, SVGProps } from "react";
import { cn } from "./cn";

/**
 * Inline alert / feedback banner. Each tone pairs a low-chroma tinted surface
 * with a leading icon and text, so the message reads without relying on color
 * (No Color-Only State Rule). Flat by default — a 1px border, no shadow.
 *
 * Compose freely:
 *   <Alert tone="warning">
 *     <AlertTitle>Deploy queued</AlertTitle>
 *     <AlertBody>The Worker build started 2 minutes ago.</AlertBody>
 *   </Alert>
 */
export type AlertTone = "info" | "success" | "warning" | "danger";

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone;
  /** Override the default tone icon. Pass `null` to hide it. */
  icon?: ReactNode | null;
};

const toneSurface: Record<AlertTone, string> = {
  info: "bg-info-subtle text-foreground border-info/30",
  success: "bg-success-subtle text-foreground border-success/30",
  warning: "bg-warning-subtle text-foreground border-warning/30",
  danger: "bg-danger-subtle text-foreground border-danger/30",
};

const toneIconColor: Record<AlertTone, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

const toneIcon: Record<AlertTone, ReactNode> = {
  info: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </Icon>
  ),
  success: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </Icon>
  ),
  warning: (
    <Icon>
      <path d="M10.3 3.3 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
  ),
  danger: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </Icon>
  ),
};

export function Alert({
  tone = "info",
  icon,
  className,
  children,
  role,
  ...props
}: AlertProps) {
  const resolvedIcon = icon === undefined ? toneIcon[tone] : icon;
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        toneSurface[tone],
        className,
      )}
      {...props}
    >
      {resolvedIcon ? (
        <span className={cn("mt-0.5 shrink-0", toneIconColor[tone])}>
          {resolvedIcon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function AlertTitle({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("font-medium text-foreground", className)} {...props} />
  );
}

export function AlertBody({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-foreground-muted", className)} {...props} />
  );
}
