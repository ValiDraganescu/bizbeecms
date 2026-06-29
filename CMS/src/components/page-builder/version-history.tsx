"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/** A published version row shape from `GET /api/pages/[id]/versions` (buildHistory). */
interface HistoryEntry {
  id: string;
  versionNo: number;
  createdAt: number;
  isCurrent: boolean;
}

/**
 * Right-rail PAGE tab — VERSION HISTORY (page-builder Versioning slice 4).
 * Lists the page's PUBLISHED versions (newest first) from
 * `GET /api/pages/[id]/versions`; per version: VIEW it read-only in the preview
 * iframe (`?version=`), or "Create draft from this version"
 * (`POST /api/pages/[id]/restore`) which copies it into a fresh editable draft
 * (source untouched) and reloads the editor. The currently-live version is
 * flagged. Restore is gated by an in-app confirm (no native window.confirm).
 */
export function VersionHistory({
  pageId,
  viewingVersionId,
  onView,
  onExitView,
  onRestore,
}: {
  pageId: string;
  viewingVersionId: string | null;
  onView: (versionId: string) => void;
  onExitView: () => void;
  onRestore: (versionId: string) => Promise<boolean>;
}) {
  const t = useTranslations("pageBuilder");
  const [versions, setVersions] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/pages/${pageId}/versions`);
        if (!live) return;
        if (res.ok) {
          const body = (await res.json()) as { versions?: HistoryEntry[] };
          setVersions(body.versions ?? []);
        } else {
          setError(`HTTP ${res.status}`);
        }
      } catch (err) {
        if (live) setError((err as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [pageId]);

  async function restore(versionId: string) {
    setError(null);
    setBusyId(versionId);
    try {
      const ok = await onRestore(versionId);
      if (!ok) setError(t("versions.restoreError"));
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  const btn = "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <span className="text-xs uppercase tracking-wide text-foreground-muted">
        {t("versions.label")}
      </span>

      {viewingVersionId && (
        <div className="flex items-center justify-between rounded-md border border-primary bg-primary-subtle px-3 py-2">
          <span className="text-xs text-foreground">{t("versions.viewingBanner")}</span>
          <button
            type="button"
            onClick={onExitView}
            className={`${btn} border border-border text-foreground hover:bg-surface-muted`}
          >
            {t("versions.exitView")}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-foreground-muted">{t("versions.loading")}</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-foreground-muted">{t("versions.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {t("versions.versionNo", { no: v.versionNo })}
                  {v.isCurrent && (
                    <span className="ml-2 rounded bg-primary-subtle px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                      {t("versions.current")}
                    </span>
                  )}
                </span>
                {viewingVersionId === v.id && (
                  <span className="text-[10px] uppercase tracking-wide text-primary">
                    {t("versions.viewing")}
                  </span>
                )}
              </div>
              <span className="text-xs text-foreground-muted">
                {new Date(v.createdAt).toLocaleString()}
              </span>
              {confirmId === v.id ? (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-2">
                  <p className="text-xs text-foreground">{t("versions.restoreConfirm")}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === v.id}
                      onClick={() => void restore(v.id)}
                      className={`${btn} bg-primary text-primary-foreground hover:opacity-90`}
                    >
                      {busyId === v.id ? t("versions.restoring") : t("versions.restoreAction")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === v.id}
                      onClick={() => setConfirmId(null)}
                      className={`${btn} border border-border text-foreground hover:bg-surface-muted`}
                    >
                      {t("versions.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onView(v.id)}
                    className={`${btn} border border-border text-foreground hover:bg-surface-muted`}
                  >
                    {t("versions.view")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(v.id)}
                    className={`${btn} bg-primary text-primary-foreground hover:opacity-90`}
                  >
                    {t("versions.restore")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
