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
  FieldLabel,
  Input,
} from "@/components/ui";
import type { LoginError } from "@/app/api/auth/login/route";

/**
 * Sign-in form. Submits to the REST endpoint `/api/auth/login` (server actions
 * 500 on OpenNext/Workers). A wrong email or password both surface the same
 * generic `invalidCredentials` banner so the form never reveals which accounts
 * exist; on success the client redirects to the home page.
 */
export function LoginForm({ firstRun }: { firstRun: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<LoginError | null>(null);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };
    setEmail(payload.email);
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
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
        error?: LoginError;
      };
      setError(data.error ?? "unknown");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  const emailFieldError =
    error === "emailRequired" || error === "emailInvalid"
      ? t(`errors.${error}`)
      : null;
  const passwordFieldError =
    error === "passwordRequired" ? t("errors.passwordRequired") : null;
  const formError =
    error === "invalidCredentials" || error === "unknown"
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
          aria-invalid={emailFieldError != null}
        />
        {emailFieldError ? <FieldError>{emailFieldError}</FieldError> : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="password">{t("fields.password")}</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={passwordFieldError != null}
        />
        {passwordFieldError ? (
          <FieldError>{passwordFieldError}</FieldError>
        ) : null}
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {t("login.submit")}
      </Button>

      {firstRun ? (
        <p className="text-center text-sm text-foreground-muted">
          {t("login.firstRun")}{" "}
          <Link
            href="/register"
            className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {t("register.title")}
          </Link>
        </p>
      ) : null}
    </form>
  );
}
