"use client";

/**
 * Per-Site Google OAuth client manager UI (cms-auth GOOGLE-CLIENT REWORK).
 * Talks to `GET/PATCH/DELETE /api/settings/google`. Two write-only fields —
 * Client ID (shown back, it's not a secret) and Client Secret (never echoed;
 * server stores it encrypted). Shows a "configured / not configured" badge and a
 * clear button (in-app `ConfirmModal`, NEVER native confirm — it hangs browser
 * review sessions; CAVEAT).
 *
 * REST-only (no server actions). next-intl copy (EN/FI/ET). Purpose-token
 * Tailwind only (bg-surface, text-foreground, …) — never raw colors.
 *
 * ponytail: client fetch + local state, no data lib. Server (`isValidClientId`/
 * `isValidClientSecret`) is the validation source of truth; the client just
 * disables an incomplete form.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmModal } from "@/components/content/confirm-modal";
import type { GoogleClientStatus } from "@/lib/auth/google-config";

export function GoogleClientManager() {
  const t = useTranslations("googleClient");
  const [status, setStatus] = useState<GoogleClientStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/google");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = (await res.json()) as GoogleClientStatus;
      setStatus(s);
      setClientId(s.clientId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/google", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* non-JSON */
        }
        throw new Error(msg);
      }
      setStatus((await res.json()) as GoogleClientStatus);
      setClientSecret(""); // never keep the secret in the field after save
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmClear() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/google", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus({ clientId: "", hasSecret: false, configured: false });
      setClientId("");
      setClientSecret("");
      setClearing(false);
      setSaved(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-foreground-muted">{t("loading")}</p>;

  const configured = status?.configured ?? false;
  // Secret is required only when none is stored yet; when re-saving an existing
  // config the operator can change just the id and leave the secret field blank.
  const canSave =
    clientId.trim() !== "" &&
    (clientSecret.trim() !== "" || status?.hasSecret === true) &&
    !busy;

  return (
    <div className="flex flex-col gap-4">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground-muted">{t("statusLabel")}</span>
        <span
          className={
            "rounded px-2 py-1 text-sm " +
            (configured
              ? "bg-success-subtle text-success"
              : "bg-surface-raised text-foreground-muted")
          }
        >
          {configured ? t("configured") : t("notConfigured")}
        </span>
      </div>

      <p className="text-sm text-foreground-muted">{t("help")}</p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">{t("clientIdLabel")}</span>
          <input
            className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
            placeholder={t("clientIdPlaceholder")}
            value={clientId}
            maxLength={256}
            onChange={(e) => setClientId(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">{t("clientSecretLabel")}</span>
          <input
            type="password"
            autoComplete="new-password"
            className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
            placeholder={status?.hasSecret ? t("clientSecretSetPlaceholder") : t("clientSecretPlaceholder")}
            value={clientSecret}
            maxLength={512}
            onChange={(e) => setClientSecret(e.target.value)}
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            disabled={!canSave}
          >
            {busy ? t("saving") : t("save")}
          </button>
          {configured && (
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-danger disabled:opacity-40"
              disabled={busy}
              onClick={() => setClearing(true)}
            >
              {t("clear")}
            </button>
          )}
          {saved && <span className="text-sm text-success">{t("saved")}</span>}
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}

      {clearing && (
        <ConfirmModal
          message={t("clearConfirm")}
          confirmLabel={t("clear")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onConfirm={() => void confirmClear()}
          onCancel={() => setClearing(false)}
        />
      )}
    </div>
  );
}
