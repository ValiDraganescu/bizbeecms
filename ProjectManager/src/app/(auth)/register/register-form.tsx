"use client";

import Link from "next/link";
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
import type { RegisterError } from "@/app/api/auth/register/route";

/**
 * First-registrant form. Submits to the REST endpoint `/api/auth/register`
 * (server actions 500 on OpenNext/Workers). Field and form errors come back as
 * stable keys resolved against `auth.errors.*`; on success the client redirects
 * to the home page.
 */
export function RegisterForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<RegisterError | null>(null);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
    };
    setEmail(payload.email);
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: RegisterError;
      };
      setError(data.error ?? "unknown");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  const fieldError = (key: RegisterError) =>
    error === key ? t(`errors.${key}`) : null;

  // A whole-form (non field-specific) error renders in a banner above.
  const formError =
    error === "registrationClosed" ||
    error === "emailTaken" ||
    error === "unknown"
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
        <FieldLabel htmlFor="email">{t("fields.email")}</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={email}
          aria-invalid={error === "emailRequired" || error === "emailInvalid"}
        />
        {fieldError("emailRequired") || fieldError("emailInvalid") ? (
          <FieldError>
            {fieldError("emailRequired") ?? fieldError("emailInvalid")}
          </FieldError>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="password">{t("fields.password")}</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={
            error === "passwordRequired" || error === "passwordTooShort"
          }
        />
        {fieldError("passwordRequired") || fieldError("passwordTooShort") ? (
          <FieldError>
            {fieldError("passwordRequired") ?? fieldError("passwordTooShort")}
          </FieldError>
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
          aria-invalid={error === "passwordMismatch"}
        />
        {fieldError("passwordMismatch") ? (
          <FieldError>{fieldError("passwordMismatch")}</FieldError>
        ) : null}
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {t("register.submit")}
      </Button>

      <p className="text-center text-sm text-foreground-muted">
        {t("register.haveAccount")}{" "}
        <Link
          href="/login"
          className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {t("login.title")}
        </Link>
      </p>
    </form>
  );
}
