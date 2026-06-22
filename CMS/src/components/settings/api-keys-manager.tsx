"use client";

/**
 * CMS API-key manager UI (cms-mcp Slice 4). Lists / mints / revokes the bearer
 * keys for the remote MCP server, talking to `GET/POST/DELETE /api/keys`.
 *
 * The minted plaintext is shown ONCE in an in-app modal (the server forgets it),
 * then never again. Revoke uses the shared in-app `ConfirmModal` — NEVER native
 * confirm()/alert() (those hang browser-automation review sessions; CAVEAT).
 *
 * REST-only (no server actions). Copy via next-intl (EN/FI/ET). Purpose-token
 * Tailwind utilities only (bg-surface, text-foreground, …) — never raw colors.
 *
 * ponytail: client fetch + local list mutation, no data lib. Validation source of
 * truth stays the server (`isValidLabel`); the client just disables an empty form.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmModal } from "@/components/content/confirm-modal";
import type { ApiKeyListItem } from "@/db/api-key-store";

function fmt(ts: number | null): string {
  return ts == null ? "—" : new Date(ts).toLocaleDateString();
}

export function ApiKeysManager() {
  const t = useTranslations("apiKeys");
  const [keys, setKeys] = useState<ApiKeyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The plaintext to show once, after a successful mint.
  const [minted, setMinted] = useState<string | null>(null);
  // The key id pending revoke confirmation.
  const [revoking, setRevoking] = useState<ApiKeyListItem | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keys");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setKeys((await res.json()) as ApiKeyListItem[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
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
      const { key, item } = (await res.json()) as {
        key: string;
        item: ApiKeyListItem;
      };
      setKeys((prev) => [item, ...prev]);
      setMinted(key);
      setLabel("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!revoking) return;
    const id = revoking.id;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/keys?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Reflect the revocation locally without a full reload.
      setKeys((prev) =>
        prev.map((k) =>
          k.id === id ? { ...k, revokedAt: Date.now() } : k,
        ),
      );
      setRevoking(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Create */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-foreground"
          placeholder={t("labelPlaceholder")}
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          aria-label={t("labelPlaceholder")}
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          disabled={busy || label.trim() === ""}
        >
          {busy ? t("creating") : t("create")}
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}

      {/* List */}
      {loading ? (
        <p className="text-foreground-muted">{t("loading")}</p>
      ) : keys.length === 0 ? (
        <p className="text-foreground-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((k) => {
            const revoked = k.revokedAt != null;
            return (
              <li
                key={k.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-foreground">
                    {k.label}
                  </span>
                  <span className="font-mono text-sm text-foreground-muted">
                    {k.keyPrefix}…
                  </span>
                  <span className="text-sm text-foreground-muted">
                    {t("createdAt", { date: fmt(k.createdAt) })} ·{" "}
                    {t("lastUsedAt", { date: fmt(k.lastUsedAt) })}
                  </span>
                </div>
                {revoked ? (
                  <span className="rounded bg-danger-subtle px-2 py-1 text-sm text-danger">
                    {t("revoked")}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="rounded border border-border px-3 py-1 text-danger disabled:opacity-40"
                    disabled={busy}
                    onClick={() => setRevoking(k)}
                  >
                    {t("revoke")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Show-once minted-key modal */}
      {minted && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setMinted(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setMinted(null);
          }}
        >
          <div
            className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-surface-raised p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-foreground">
              {t("mintedTitle")}
            </h2>
            <p className="text-foreground-muted">{t("mintedWarning")}</p>
            <code className="block break-all rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground">
              {minted}
            </code>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-4 py-2 text-foreground"
                onClick={() => void navigator.clipboard?.writeText(minted)}
              >
                {t("copy")}
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
                onClick={() => setMinted(null)}
              >
                {t("done")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirm modal (in-app, never native) */}
      {revoking && (
        <ConfirmModal
          message={t("revokeConfirm", { label: revoking.label })}
          confirmLabel={t("revoke")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onConfirm={() => void confirmRevoke()}
          onCancel={() => setRevoking(null)}
        />
      )}
    </div>
  );
}
