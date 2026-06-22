"use client";

/**
 * CMS accept-invite form (cms-auth Slice 4). The invitee (already gated to a
 * VALID token by the server page) sets a password (10-char min, confirmed) →
 * POST /api/invite/accept/[token] which creates their CMS user with the invited
 * role and mints a session. On success we hard-navigate to /admin so the new
 * session cookie is picked up by the server layout.
 *
 * REST-only (no server actions). All copy via next-intl (EN/FI/ET). Purpose-token
 * Tailwind utilities only.
 *
 * ponytail: one fetch, no form lib. Generic, mapped error strings from i18n.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

export function AcceptInviteForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const t = useTranslations("acceptInvite");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/accept/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword: confirm }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(errorMessage(data?.error));
        return;
      }
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
      case "passwordTooShort":
        return t("errorTooShort");
      case "passwordMismatch":
        return t("errorMismatch");
      case "expired":
        return t("errorExpired");
      case "accepted":
        return t("errorAccepted");
      case "notFound":
        return t("errorNotFound");
      case "emailTaken":
        return t("errorEmailTaken");
      default:
        return t("errorGeneric");
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-foreground-muted">{t("subtitle", { email })}</p>
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
