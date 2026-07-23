"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  Button,
  Field,
  FieldLabel,
  Input,
} from "@/components/ui";
import type { DeleteSiteError } from "@/app/api/sites/[id]/route";

/**
 * Danger-zone delete for a Site. Opens an in-app dialog (never window.confirm —
 * see ConfirmDialog's CAVEAT) that requires typing the Site's slug before the
 * destructive button arms; the server re-checks the typed slug, so the guard
 * can't be bypassed by calling the API directly. On success, navigates back to
 * the Sites list (this Site's page no longer exists).
 */
export function DeleteSiteForm({
  siteId,
  slug,
  siteName,
}: {
  siteId: string;
  slug: string;
  siteName: string;
}) {
  const t = useTranslations("sites.dangerZone");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<DeleteSiteError | null>(null);

  const armed = confirm.trim() === slug;

  async function destroy() {
    if (!armed || pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmSlug: confirm.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: DeleteSiteError;
      };
      if (res.ok && data.ok) {
        router.push("/sites");
        router.refresh();
        return;
      }
      setError(data.error ?? "unknown");
      setPending(false);
    } catch {
      setError("unknown");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground-muted">{t("description")}</p>
      <Button
        variant="danger"
        className="w-fit"
        onClick={() => {
          setConfirm("");
          setError(null);
          setOpen(true);
        }}
      >
        {t("button")}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight">
              {t("dialogTitle", { name: siteName })}
            </h2>
            <Alert tone="danger">
              <AlertBody>{t("dialogBody")}</AlertBody>
            </Alert>
            <Field>
              <FieldLabel htmlFor="delete-site-confirm">
                {t("confirmLabel", { slug })}
              </FieldLabel>
              <Input
                id="delete-site-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={slug}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                disabled={pending}
              />
            </Field>
            {error ? (
              <Alert tone="danger">
                <AlertBody>{t(`errors.${error}`)}</AlertBody>
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={destroy}
                disabled={!armed}
                loading={pending}
              >
                {t("confirm")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
