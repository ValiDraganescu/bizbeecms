"use client";

/**
 * CMS reset-password form (auth-reset C4; mirrors PM P4 + accept-invite-form).
 * The visitor (gated to a VALID token by the server page) sets a new password
 * (10-char min, confirmed) → POST /api/auth/reset. On success we hard-navigate to
 * /admin, where the (now session-invalidated) visitor sees the login page.
 *
 * The reset route returns BARE error keys; map them here. All token failures
 * collapse to ONE generic `resetTokenInvalid` (no detail leak — C3 never reveals
 * why), so a token that expires between page-load and submit shows that message.
 *
 * REST-only (no server actions). All copy via next-intl (EN/FI/ET). Purpose-token
 * Tailwind utilities only.
 *
 * ponytail: one fetch, no form lib. Mapped error strings from i18n.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("resetPassword");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword: confirm }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(errorMessage(data?.error));
        return;
      }
      // Sessions were invalidated server-side; land on /admin → login page.
      window.location.href = "/admin";
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  // Map known API error keys to a localized message; fall back to generic.
  function errorMessage(key: string | undefined): string {
    switch (key) {
      case "passwordRequired":
      case "passwordTooShort":
        return t("errorTooShort");
      case "passwordMismatch":
        return t("errorMismatch");
      case "resetTokenInvalid":
        return t("errorTokenInvalid");
      default:
        return t("errorGeneric");
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-foreground-muted">{t("subtitle")}</p>
      </div>

      <form
        className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4"
        onSubmit={(e) => void submit(e)}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{t("passwordLabel")}</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{t("confirmLabel")}</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        <p className="text-xs text-foreground-muted">{t("passwordHint")}</p>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          disabled={busy}
        >
          {busy ? t("submitting") : t("submit")}
        </button>
      </form>
    </main>
  );
}
