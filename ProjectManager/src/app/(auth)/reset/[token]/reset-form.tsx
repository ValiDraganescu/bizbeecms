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
import {
  MIN_PASSWORD_LENGTH,
  type PasswordErrorKey,
} from "@/lib/auth/validation";

type ResetError =
  | PasswordErrorKey
  | "passwordMismatch"
  | "resetTokenInvalid"
  | "unknown";

/**
 * Set-new-password form for a reset link. Submits to the REST endpoint
 * `/api/auth/reset` (server actions 500 on OpenNext/Workers). Token is bound
 * from the route; on success the client redirects to sign-in. Invalid/expired/
 * used tokens all surface the same generic `resetTokenInvalid` banner.
 */
export function ResetForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<ResetError | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      token,
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
    };
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push("/login");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: ResetError;
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
  const formError =
    error === "resetTokenInvalid" || error === "unknown"
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
        <FieldLabel htmlFor="password">{t("fields.password")}</FieldLabel>
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
            {t("fields.passwordHint", { min: MIN_PASSWORD_LENGTH })}
          </FieldHint>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="confirmPassword">
          {t("fields.confirmPassword")}
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
        {t("reset.submit")}
      </Button>
    </form>
  );
}
