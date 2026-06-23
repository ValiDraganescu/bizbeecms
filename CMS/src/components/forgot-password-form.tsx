"use client";

/**
 * CMS forgot-password form (auth-reset C4; mirrors PM P4). Public, no auth gate.
 * Email field → POST /api/auth/forgot. The endpoint is enumeration-safe (always
 * 200 {ok:true} whether or not the email matches), so on ANY 2xx we show the same
 * "if an account exists…" success — NO branching on the response body.
 *
 * REST-only (no server actions). All copy via next-intl (EN/FI/ET). Purpose-token
 * Tailwind utilities only, mirroring login-form / accept-invite-form.
 *
 * ponytail: one fetch, no form lib. A non-2xx just shows the generic network
 * error — the route only non-200s on a malformed request, which `type=email`
 * already guards.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

export function ForgotPasswordForm() {
  const t = useTranslations("forgotPassword");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Enumeration-safe: any 2xx → same success, no body branching.
      if (res.ok) {
        setSent(true);
        return;
      }
      setError(t("errorGeneric"));
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p
          role="status"
          className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
        >
          {t("success")}
        </p>
        <a className="text-sm text-primary hover:underline" href="/admin">
          {t("backToSignIn")}
        </a>
      </main>
    );
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
          <span className="text-sm font-medium text-foreground">{t("emailLabel")}</span>
          <input
            type="email"
            autoComplete="username"
            required
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

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

      <a className="text-center text-sm text-primary hover:underline" href="/admin">
        {t("backToSignIn")}
      </a>
    </main>
  );
}
