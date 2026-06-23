"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  Badge,
  Button,
  ConfirmDialog,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

export type PendingInvite = {
  id: string;
  email: string;
  /** Already-localized role label. */
  roleLabel: string;
  /** Already-resolved country list ("Global" when empty). */
  countryText: string;
  /** Already-resolved tag labels. */
  tagLabels: string[];
  /** YYYY-MM-DD. */
  expires: string;
};

/**
 * Pending invitations table with a per-row revoke control (bug fix 2026-06-23 —
 * PM had no way to cancel a pending invite). Revoke goes through
 * `DELETE /api/invite/[id]` behind an in-app confirm modal (no native dialog
 * — CAVEATS). Server data is pre-resolved into strings so this stays a thin
 * client shell.
 */
export function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  const t = useTranslations("invites");
  const router = useRouter();
  const [confirming, setConfirming] = useState<PendingInvite | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState(false);

  async function revoke(id: string) {
    setRevoking(true);
    setError(false);
    try {
      const res = await fetch(`/api/invite/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(true);
        return;
      }
      setConfirming(null);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setRevoking(false);
    }
  }

  if (invites.length === 0) {
    return <p className="text-sm text-foreground-muted">{t("pending.empty")}</p>;
  }

  return (
    <>
      {error ? (
        <Alert tone="danger" className="mb-4">
          <AlertBody>{t("revoke.error")}</AlertBody>
        </Alert>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("pending.email")}</TableHead>
            <TableHead>{t("pending.role")}</TableHead>
            <TableHead>{t("pending.country")}</TableHead>
            <TableHead>{t("pending.tags")}</TableHead>
            <TableHead>{t("pending.expires")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("pending.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell>{inv.email}</TableCell>
              <TableCell>
                <Badge tone="neutral">{inv.roleLabel}</Badge>
              </TableCell>
              <TableCell>{inv.countryText}</TableCell>
              <TableCell>
                {inv.tagLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {inv.tagLabels.map((label) => (
                      <Badge key={label} tone="primary">
                        {label}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-foreground-muted">—</span>
                )}
              </TableCell>
              <TableCell className="tabular-nums text-foreground-muted">
                {inv.expires}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger/10"
                  onClick={() => {
                    setError(false);
                    setConfirming(inv);
                  }}
                >
                  {t("revoke.action")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {confirming ? (
        <ConfirmDialog
          title={t("revoke.title")}
          body={t("revoke.body", { email: confirming.email })}
          confirmLabel={t("revoke.confirm")}
          cancelLabel={t("revoke.cancel")}
          loading={revoking}
          onCancel={() => setConfirming(null)}
          onConfirm={() => revoke(confirming.id)}
        />
      ) : null}
    </>
  );
}
