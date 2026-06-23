"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
} from "@/components/ui";
import type { EmailErrorKey } from "@/lib/auth/validation";

type ForgotError = EmailErrorKey | "unknown";

/**
 * Forgot-password form. Submits to the REST endpoint `/api/auth/forgot` (server
 * actions 500 on OpenNext/Workers). The endpoint is enumeration-safe: it returns
 * the same success body whether or not the email matches a user, so on any 2xx
 * we show the same "if an account exists…" message and never reveal existence.
 */
export function ForgotForm() {
  const t = useTranslations("auth");
  const [error, setError] = useState<ForgotError | null>(null);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = String(form.get("email") ?? "");
    setEmail(value);
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if (res.ok) {
        setSent(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: ForgotError;
      };
      setError(data.error ?? "unknown");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">
          <AlertBody>{t("forgot.success")}</AlertBody>
        </Alert>
        <p className="text-center text-sm text-foreground-muted">
          <Link
            href="/login"
            className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {t("forgot.backToSignIn")}
          </Link>
        </p>
      </div>
    );
  }

  const emailFieldError =
    error === "emailRequired" || error === "emailInvalid"
      ? t(`errors.${error}`)
      : null;
  const formError = error === "unknown" ? t("errors.unknown") : null;

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
          aria-invalid={emailFieldError != null}
        />
        {emailFieldError ? <FieldError>{emailFieldError}</FieldError> : null}
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {t("forgot.submit")}
      </Button>

      <p className="text-center text-sm text-foreground-muted">
        <Link
          href="/login"
          className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {t("forgot.backToSignIn")}
        </Link>
      </p>
    </form>
  );
}
