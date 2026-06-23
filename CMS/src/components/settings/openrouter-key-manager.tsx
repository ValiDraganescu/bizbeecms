"use client";

/**
 * CMS-local OpenRouter user-key manager UI (ai-openrouter KEY-MINTING track).
 * Talks to `GET/PATCH/DELETE /api/settings/openrouter-key`. One write-only field
 * (the key is never echoed; server stores it encrypted). Shows a "key set / no
 * key" badge + a clear button (in-app `ConfirmModal`, NEVER native confirm — it
 * hangs browser review sessions; CAVEAT).
 *
 * REST-only (no server actions). next-intl copy (EN/FI/ET). Purpose-token
 * Tailwind only (bg-surface, text-foreground, …) — never raw colors.
 *
 * ponytail: client fetch + local state, no data lib. Server (`isValidUserKey`)
 * is the validation source of truth; the client just disables an empty form.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmModal } from "@/components/content/confirm-modal";
import type { OpenrouterUserKeyStatus } from "@/lib/settings/openrouter-key";

export function OpenrouterKeyManager() {
  const t = useTranslations("openrouterKey");
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/openrouter-key");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = (await res.json()) as OpenrouterUserKeyStatus;
      setHasKey(s.hasKey);
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
      const res = await fetch("/api/settings/openrouter-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
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
      setHasKey(((await res.json()) as OpenrouterUserKeyStatus).hasKey);
      setKey(""); // never keep the key in the field after save
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
      const res = await fetch("/api/settings/openrouter-key", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHasKey(false);
      setKey("");
      setClearing(false);
      setSaved(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-foreground-muted">{t("loading")}</p>;

  const canSave = key.trim() !== "" && !busy;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground-muted">{t("statusLabel")}</span>
        <span
          className={
            "rounded px-2 py-1 text-sm " +
            (hasKey
              ? "bg-success-subtle text-success"
              : "bg-surface-raised text-foreground-muted")
          }
        >
          {hasKey ? t("keySet") : t("noKey")}
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
          <span className="text-sm font-medium text-foreground">{t("keyLabel")}</span>
          <input
            type="password"
            autoComplete="new-password"
            className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
            placeholder={hasKey ? t("keySetPlaceholder") : t("keyPlaceholder")}
            value={key}
            maxLength={256}
            onChange={(e) => setKey(e.target.value)}
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
          {hasKey && (
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
