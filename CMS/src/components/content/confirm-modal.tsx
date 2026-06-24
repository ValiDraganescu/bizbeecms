"use client";

/**
 * content-collections — Slice 5: tiny in-app confirm modal.
 *
 * NEVER native window.confirm() — that blocks the browser-automation review
 * sessions (CAVEAT). A plain centered overlay with a message + confirm/cancel.
 * All copy is passed in by the caller (already translated).
 *
 * ponytail: one fixed overlay, no portal/focus-trap lib. Esc/backdrop cancel.
 */

export function ConfirmModal({
  message,
  title,
  children,
  confirmLabel,
  cancelLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  message?: string;
  title?: string;
  children?: React.ReactNode; // optional form body (e.g. a rename input)
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-surface-raised p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
        {message && <p className="text-foreground">{message}</p>}
        {children}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-4 py-2 text-foreground disabled:opacity-50"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`rounded-md px-4 py-2 text-primary-foreground disabled:opacity-50 ${
              danger ? "bg-danger" : "bg-primary"
            }`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
