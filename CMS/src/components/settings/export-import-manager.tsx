"use client";

/**
 * site-export-import — Admin UI (BACKLOG's Admin UI task). Drives the full
 * export/import protocol per FORMAT.md against the already-shipped REST
 * surface: `GET /api/site-export` (+ per-asset `GET .../asset/<key>`),
 * `POST /api/site-import/validate` (dry-run), `POST /api/site-import`
 * (destructive execute), `POST /api/site-import/asset/<key>` (per-asset
 * upload). No new server logic — this component is pure client orchestration.
 *
 * Export: one click downloads ONE `site-<name>.zip` — `site.json` (the
 * envelope) + every asset under `assets/<key>` — zipped CLIENT-SIDE with
 * `fflate` (FORMAT.md §4a). Zero server changes: fetches the same envelope +
 * per-asset endpoints as before, just bundles them in the browser instead of
 * offering N separate downloads.
 *
 * Import: pick the exported `site.json` → validate (dry-run report + typed
 * site-name confirmation) → execute (destructive) → upload every asset the
 * response lists in `assetKeysToUpload`, matched by filename against a
 * multi-file picker.
 *
 * REST-only (no server actions). Copy via next-intl. Never native confirm() —
 * the destructive step is gated by a typed-text match, not a dialog.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { zipSync, type Zippable } from "fflate";

interface SiteEnvelope {
  format: string;
  version: number;
  meta: { exportedAt: string; cmsVersion: string; siteName: string };
  counts: Record<string, number>;
  tables: { asset: Array<{ key: string; filename: string; size: number }> };
}

interface DryRunReport {
  ok: boolean;
  error?: string;
  willDestroy: Record<string, number>;
  willCreate: Record<string, number>;
  secretsToReenter: Array<{ name: string; authType: string }>;
  collectionCapOk: boolean;
  warnings: string[];
}

interface ImportResult {
  ok: boolean;
  error?: string;
  restored?: Record<string, number>;
  assetKeysToUpload?: string[];
}

type ImportStep = "pick" | "review" | "uploading" | "done";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportImportManager() {
  const t = useTranslations("exportImport");

  // --- Export state ---
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exported, setExported] = useState<SiteEnvelope | null>(null);
  const [exportProgress, setExportProgress] = useState({ done: 0, total: 0 });

  // --- Import state ---
  const [step, setStep] = useState<ImportStep>("pick");
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<SiteEnvelope | null>(null);
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [assetFiles, setAssetFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploadFailures, setUploadFailures] = useState<string[]>([]);

  async function runExport() {
    setExporting(true);
    setExportError(null);
    setExportProgress({ done: 0, total: 0 });
    try {
      const res = await fetch("/api/site-export");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const envelope = (await res.json()) as SiteEnvelope;
      setExported(envelope);

      const assets = envelope.tables.asset;
      setExportProgress({ done: 0, total: assets.length });
      const files: Zippable = {
        "site.json": new TextEncoder().encode(JSON.stringify(envelope)),
      };
      for (const a of assets) {
        const assetRes = await fetch(`/api/site-export/asset/${a.key}`);
        if (!assetRes.ok) throw new Error(`HTTP ${assetRes.status} (asset ${a.key})`);
        const bytes = new Uint8Array(await assetRes.arrayBuffer());
        // ponytail: a.key is already "assets/<file>" (the R2 key namespace) — use it verbatim as the zip entry path, don't double-prefix.
        files[a.key] = bytes;
        setExportProgress((p) => ({ ...p, done: p.done + 1 }));
      }

      const zipped = zipSync(files, { level: 0 });
      const name = envelope.meta.siteName || "site";
      downloadBlob(`site-${name}-${Date.now()}.zip`, new Blob([zipped], { type: "application/zip" }));
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  function resetImport() {
    setStep("pick");
    setImportError(null);
    setArtifact(null);
    setReport(null);
    setConfirmText("");
    setAssetFiles([]);
    setUploadProgress({ done: 0, total: 0 });
    setResult(null);
    setUploadFailures([]);
  }

  async function pickFile(file: File) {
    setImportError(null);
    setBusy(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(t("badJson"));
      }
      const res = await fetch("/api/site-import/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const dryRun = (await res.json()) as DryRunReport;
      if (!dryRun.ok) {
        setImportError(dryRun.error ?? `HTTP ${res.status}`);
        return;
      }
      setArtifact(parsed as SiteEnvelope);
      setReport(dryRun);
      setStep("review");
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const expectedSiteName = artifact?.meta.siteName ?? "";
  const confirmMatches = expectedSiteName !== "" && confirmText === expectedSiteName;

  async function runImport() {
    if (!artifact || !confirmMatches) return;
    setBusy(true);
    setImportError(null);
    try {
      const res = await fetch("/api/site-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifact, confirm: confirmText }),
      });
      const data = (await res.json()) as ImportResult;
      if (!data.ok) {
        setImportError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(data);
      const toUpload = data.assetKeysToUpload ?? [];
      if (toUpload.length === 0) {
        setStep("done");
        return;
      }
      setStep("uploading");
      setUploadProgress({ done: 0, total: toUpload.length });
      const failures: string[] = [];
      const byFilename = new Map(assetFiles.map((f) => [f.name, f]));
      const byKeyTail = new Map(assetFiles.map((f) => [f.name.split("/").pop() ?? f.name, f]));
      for (const key of toUpload) {
        const file = byFilename.get(key) ?? byKeyTail.get(key.split("/").pop() ?? key);
        if (!file) {
          failures.push(key);
        } else {
          try {
            const up = await fetch(`/api/site-import/asset/${key}`, {
              method: "POST",
              body: await file.arrayBuffer(),
            });
            if (!up.ok) failures.push(key);
          } catch {
            failures.push(key);
          }
        }
        setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      setUploadFailures(failures);
      setStep("done");
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Export */}
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4">
        <header>
          <h2 className="text-lg font-semibold text-foreground">{t("exportTitle")}</h2>
          <p className="mt-1 text-sm text-foreground-muted">{t("exportSubtitle")}</p>
        </header>
        <div>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            disabled={exporting}
            onClick={() => void runExport()}
          >
            {exporting
              ? t("exportingProgress", { done: exportProgress.done, total: exportProgress.total })
              : t("exportButton")}
          </button>
        </div>
        {exportError && (
          <p role="alert" className="text-sm text-danger">
            {exportError}
          </p>
        )}
        {exported && !exporting && (
          <p className="text-sm text-foreground-muted">
            {t("exportDone", { count: exported.tables.asset.length })}
          </p>
        )}
      </section>

      {/* Import */}
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4">
        <header>
          <h2 className="text-lg font-semibold text-foreground">{t("importTitle")}</h2>
          <p className="mt-1 text-sm text-foreground-muted">{t("importSubtitle")}</p>
        </header>

        {importError && (
          <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
            {importError}
          </p>
        )}

        {step === "pick" && (
          <label className="flex flex-col gap-2 text-sm text-foreground">
            <span className="font-medium">{t("pickFileLabel")}</span>
            <input
              type="file"
              accept="application/json"
              disabled={busy}
              className="text-foreground-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground hover:file:bg-primary-hover disabled:opacity-50"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void pickFile(file);
                e.target.value = "";
              }}
            />
          </label>
        )}

        {step === "review" && report && artifact && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-danger bg-danger-subtle p-3">
                <h3 className="font-medium text-danger">{t("willDestroy")}</h3>
                <ul className="mt-1 text-foreground">
                  {Object.entries(report.willDestroy).map(([k, v]) => (
                    <li key={k}>
                      {k}: {v}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-border bg-surface p-3">
                <h3 className="font-medium text-foreground">{t("willCreate")}</h3>
                <ul className="mt-1 text-foreground-muted">
                  {Object.entries(report.willCreate).map(([k, v]) => (
                    <li key={k}>
                      {k}: {v}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {!report.collectionCapOk && (
              <p role="alert" className="text-sm text-danger">
                {t("collectionCapExceeded")}
              </p>
            )}

            {report.warnings.length > 0 && (
              <ul className="rounded-md border border-border bg-surface p-3 text-sm text-foreground-muted">
                {report.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}

            {report.secretsToReenter.length > 0 && (
              <div className="rounded-md border border-border bg-surface p-3 text-sm">
                <h3 className="font-medium text-foreground">{t("secretsTitle")}</h3>
                <p className="mt-1 text-foreground-muted">{t("secretsHint")}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {report.secretsToReenter.map((s) => (
                    <li key={s.name} className="text-foreground">
                      {s.name} ({s.authType})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {artifact.tables.asset.length > 0 && (
              <label className="flex flex-col gap-2 text-sm text-foreground">
                <span className="font-medium">
                  {t("pickAssetsLabel", { count: artifact.tables.asset.length })}
                </span>
                <input
                  type="file"
                  multiple
                  className="text-foreground-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground hover:file:bg-primary-hover"
                  onChange={(e) => setAssetFiles(Array.from(e.target.files ?? []))}
                />
                <span className="text-xs text-foreground-muted">
                  {t("pickAssetsHint", { picked: assetFiles.length })}
                </span>
              </label>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-sm text-foreground">
                {t("confirmLabel")}{" "}
                <strong className="font-mono">
                  {expectedSiteName || t("blankSiteName")}
                </strong>
              </label>
              <input
                type="text"
                className="rounded-md border border-border bg-surface px-3 py-2 text-foreground"
                value={confirmText}
                disabled={expectedSiteName === ""}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={expectedSiteName}
              />
              {expectedSiteName === "" && (
                <p className="text-sm text-danger">{t("blankSiteNameError")}</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-4 py-2 text-foreground"
                onClick={resetImport}
                disabled={busy}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="rounded-md bg-danger px-4 py-2 text-primary-foreground disabled:opacity-50"
                disabled={busy || !confirmMatches || !report.collectionCapOk}
                onClick={() => void runImport()}
              >
                {busy ? t("importing") : t("importButton")}
              </button>
            </div>
          </div>
        )}

        {step === "uploading" && (
          <p className="text-sm text-foreground-muted">
            {t("uploadingProgress", { done: uploadProgress.done, total: uploadProgress.total })}
          </p>
        )}

        {step === "done" && result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground">{t("importSuccess")}</p>
            {result.restored && (
              <ul className="rounded-md border border-border bg-surface p-3 text-sm text-foreground-muted">
                {Object.entries(result.restored).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
            )}
            {uploadFailures.length > 0 && (
              <p role="alert" className="text-sm text-danger">
                {t("uploadFailures", { count: uploadFailures.length })}: {uploadFailures.join(", ")}
              </p>
            )}
            {report && report.secretsToReenter.length > 0 && (
              <p className="text-sm text-foreground-muted">{t("secretsReminder")}</p>
            )}
            <div>
              <button
                type="button"
                className="rounded-md border border-border px-4 py-2 text-foreground"
                onClick={resetImport}
              >
                {t("importAnother")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
