"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  Button,
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  Input,
} from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";
import type { AcceptError } from "@/app/api/invite/accept/[token]/route";

/**
 * Set-password form for accepting an invite. Submits to the REST endpoint
 * `/api/invite/accept/<token>` (server actions 500 on OpenNext/Workers). Token
 * is bound from the route; on success the client redirects to the home page.
 */
export function AcceptForm({ token }: { token: string }) {
  const t = useTranslations("invites.accept");
  const router = useRouter();
  const [error, setError] = useState<AcceptError | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
    };
    setError(null);
    setPending(true);
    try {
      const res = await fetch(
        `/api/invite/accept/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: AcceptError;
      };
      setError(data.error ?? "unknown");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  const passwordFieldError =
    error === "passwordRequired" || error === "passwordTooShort"
      ? t(`errors.${error}`)
      : null;
  const confirmFieldError =
    error === "passwordMismatch" ? t("errors.passwordMismatch") : null;

  // Invite-level failures (expired/used/taken between page load and submit).
  const formError =
    error &&
    ["notFound", "expired", "accepted", "emailTaken", "unknown"].includes(error)
      ? t(`errors.${error}`)
      : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? (
        <Alert tone="danger">
          <AlertBody>{formError}</AlertBody>
        </Alert>
      ) : null}

      <Field>
        <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={passwordFieldError != null}
        />
        {passwordFieldError ? (
          <FieldError>{passwordFieldError}</FieldError>
        ) : (
          <FieldHint>
            {t("passwordHint", { min: MIN_PASSWORD_LENGTH })}
          </FieldHint>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="confirmPassword">
          {t("confirmPassword")}
        </FieldLabel>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={confirmFieldError != null}
        />
        {confirmFieldError ? (
          <FieldError>{confirmFieldError}</FieldError>
        ) : null}
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
}
