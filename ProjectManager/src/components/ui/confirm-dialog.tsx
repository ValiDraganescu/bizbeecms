import type { ReactNode } from "react";
import { Alert, AlertBody } from "./alert";
import { Button, type ButtonProps } from "./button";

/**
 * In-app confirm dialog — the single overlay-dialog used for destructive
 * confirmations (delete tag, remove user, revoke invite). NEVER window.confirm:
 * native dialogs hang browser-automation review sessions (CAVEATS).
 *
 * Click the dimmed overlay to cancel; the panel stops propagation. The confirm
 * button defaults to the `danger` variant since every current use is destructive.
 *
 *   <ConfirmDialog
 *     title={t("remove.title")}
 *     body={t("remove.body", { email })}
 *     confirmLabel={t("actions.remove")}
 *     cancelLabel={t("actions.cancel")}
 *     loading={deleting}
 *     onCancel={close}
 *     onConfirm={confirmDelete}
 *   />
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  loading = false,
  confirmVariant = "danger",
  onCancel,
  onConfirm,
}: {
  title: ReactNode;
  body: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  loading?: boolean;
  confirmVariant?: ButtonProps["variant"];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !loading && onCancel()}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <Alert tone="danger" className="my-4">
          <AlertBody>{body}</AlertBody>
        </Alert>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
