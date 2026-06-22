"use client";

/**
 * CMS in-CMS login page (cms-auth Slice 2) — replaces the old auto-redirect to PM.
 *
 * Three sign-in methods (per the user directive):
 *   - email + password → POST /api/auth/login (mints a CMS-local session).
 *   - "Sign in with BizbeeCMS" SSO → only rendered when `showSso` (the server
 *     computed it from the PM origin); kicks off the existing cms-sso handoff.
 *   - Google → placeholder slot (wired in Slice 2b).
 *
 * REST-only (no server actions). All copy via next-intl (EN/FI/ET). Purpose-token
 * Tailwind utilities only. On success we hard-navigate to /admin so the new
 * session cookie is picked up by the server layout.
 *
 * ponytail: one fetch, no form lib. Generic error string from i18n; the API
 * returns a non-enumerating 401 so we don't distinguish "no user" from "bad pw".
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

export function LoginForm({
  showSso,
  ssoUrl,
}: {
  showSso: boolean;
  ssoUrl: string;
}) {
  const t = useTranslations("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(t("errorInvalid"));
        return;
      }
      // Hard navigation so the server layout re-runs with the new cookie.
      window.location.href = "/admin";
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setBusy(false);
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

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{t("passwordLabel")}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {busy ? t("signingIn") : t("signIn")}
        </button>
      </form>

      {/* Google sign-in slot — wired in Slice 2b. */}

      {showSso && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-foreground-muted">
            <span className="h-px flex-1 bg-border" />
            {t("or")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <a
            href={ssoUrl}
            className="rounded-md border border-border bg-surface px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-surface-raised"
          >
            {t("ssoButton")}
          </a>
        </div>
      )}
    </main>
  );
}
