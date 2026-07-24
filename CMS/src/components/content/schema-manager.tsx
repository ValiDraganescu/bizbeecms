"use client";

/**
 * Schema manager: lists a collection's fields, with RENAME (inline) + DROP
 * (confirm modal) per field. Both go through the safe table-rebuild path
 * (PATCH _op:rename_field | drop_field on /api/collections/[name]). System
 * columns aren't user fields, so they never appear here. NO native
 * confirm()/prompt() — in-app modal + inline form. Extracted from
 * collection-items.tsx (Slice 5).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CollectionView } from "@/db/collection-store";
import { errorOf } from "@/lib/api-error";
import { ConfirmModal } from "./confirm-modal";
import { INPUT } from "./field-input";

export function SchemaManager({
  collection,
  onChanged,
}: {
  collection: CollectionView;
  onChanged: (updated: CollectionView) => void | Promise<void>;
}) {
  const t = useTranslations("collections");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [pendingDrop, setPendingDrop] = useState<string | null>(null);

  async function patchOp(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(collection.tableName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return false;
      }
      await onChanged((await res.json()) as CollectionView);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4">
      <h2 className="text-lg font-semibold text-foreground">{t("schemaFields")}</h2>
      {error && <p className="text-danger">{error}</p>}
      {collection.fields.length === 0 ? (
        <p className="text-foreground-muted">{t("fieldCount", { count: 0 })}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {collection.fields.map((f) => (
            <li key={f.name} className="flex flex-wrap items-center gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0">
              <span className="font-mono text-foreground">{f.name}</span>
              <span className="text-xs text-foreground-muted">{f.type}</span>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40"
                  disabled={busy}
                  onClick={() => {
                    setRenaming(f.name);
                    setRenameTo(f.name);
                  }}
                >
                  {t("renameField")}
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-danger disabled:opacity-40"
                  disabled={busy}
                  onClick={() => setPendingDrop(f.name)}
                >
                  {t("dropField")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {renaming && (
        <ConfirmModal
          title={t("renameFieldTitle", { name: renaming })}
          confirmLabel={t("rename")}
          cancelLabel={t("cancel")}
          busy={busy}
          onConfirm={async () => {
            const to = renameTo.trim();
            if (!to || to === renaming) {
              setRenaming(null);
              return;
            }
            if (await patchOp({ _op: "rename_field", field: renaming, to })) setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">{t("newFieldName")}</span>
            <input
              className={INPUT}
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
              placeholder={t("fieldNamePlaceholder")}
            />
          </label>
        </ConfirmModal>
      )}

      {pendingDrop && (
        <ConfirmModal
          message={t("confirmDropField", { name: pendingDrop })}
          confirmLabel={t("dropField")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onConfirm={async () => {
            if (await patchOp({ _op: "drop_field", field: pendingDrop })) setPendingDrop(null);
          }}
          onCancel={() => setPendingDrop(null)}
        />
      )}
    </div>
  );
}
