/**
 * TagChip — the ONE way a tag renders in the admin UI (user rule, 2026-07-06):
 * every place that displays a tag uses this component, so tag styling changes
 * in exactly one file. `onRemove` adds the × affordance (pass a translated
 * `removeLabel` with it); `variant="overlay"` is the dark badge drawn on top
 * of media thumbnails.
 */
export function TagChip({
  label,
  onRemove,
  removeLabel,
  disabled,
  variant = "default",
}: {
  label: string;
  onRemove?: () => void;
  /** Translated aria-label for the remove button; required in spirit when onRemove is set. */
  removeLabel?: string;
  disabled?: boolean;
  variant?: "default" | "overlay";
}) {
  const look =
    variant === "overlay"
      ? "rounded bg-foreground/75 px-1.5 py-1 text-surface"
      : "rounded-full border border-border bg-surface px-2 py-1 text-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs leading-none ${look}`}>
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={removeLabel ?? label}
          className="-my-0.5 text-foreground-muted hover:text-danger disabled:opacity-40"
        >
          ×
        </button>
      )}
    </span>
  );
}
